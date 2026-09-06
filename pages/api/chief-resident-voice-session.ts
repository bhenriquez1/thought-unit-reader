// pages/api/chief-resident-voice-session.ts
// Server-mediated OpenAI Realtime WebRTC handshake. The browser sends its
// SDP offer here; this route creates the call and returns only the SDP answer.
// OPENAI_API_KEY never leaves the server.
//
// See lib/chiefResident/chiefResidentVoiceAgent.ts for the pure
// request/response shaping this route wraps.

import type { NextApiRequest, NextApiResponse } from "next";
import {
  buildVoiceSessionRequest,
  parseVoiceCallAnswer,
  DEFAULT_VOICE_MODEL,
  DEFAULT_VOICE,
  type VoiceSessionSourceContext,
} from "@/lib/chiefResident/chiefResidentVoiceAgent";
import type { TeachingAudience } from "./chief-resident-teaching";

export const config = {
  maxDuration: 20,
  api: { bodyParser: { sizeLimit: "64kb" } },
};

// A realtime session-creation call is a small, fast request (it does not
// stream a teaching turn) — 10s leaves comfortable headroom under
// maxDuration without leaving a hung upstream call to time out on its own.
const SESSION_TIMEOUT_MS = 10_000;

interface RequestBody extends VoiceSessionSourceContext { sdp: string }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "Chief Resident voice is not configured for this deployment.",
      code: "configuration_missing",
    });
  }

  const body = (req.body ?? {}) as Partial<RequestBody>;
  if (typeof body.sourceText !== "string" || !body.sourceText.trim()) {
    return res.status(400).json({ error: "sourceText is required." });
  }
  if (typeof body.sdp !== "string" || !body.sdp.trim()) {
    return res.status(400).json({ error: "sdp is required." });
  }

  const model = process.env.OPENAI_CHIEF_RESIDENT_VOICE_MODEL || DEFAULT_VOICE_MODEL;
  const voice = process.env.OPENAI_CHIEF_RESIDENT_VOICE || DEFAULT_VOICE;
  const requestBody = buildVoiceSessionRequest(
    {
      sourceText: body.sourceText,
      title: body.title,
      pageNumber: body.pageNumber,
      audience: body.audience as TeachingAudience | undefined,
    },
    { model, voice },
  );

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SESSION_TIMEOUT_MS);
  try {
    const form = new FormData();
    form.set("sdp", new Blob([body.sdp], { type: "application/sdp" }), "offer.sdp");
    form.set("session", new Blob([JSON.stringify(requestBody)], { type: "application/json" }), "session.json");
    const upstream = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
      signal: ctrl.signal,
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      console.error("[CHIEF_RESIDENT_VOICE_SESSION_FAILED]", { stage: "upstream", status: upstream.status, body: text.slice(0, 500) });
      return res.status(502).json({ error: "Could not start a live voice session.", code: "upstream_error" });
    }

    const raw = await upstream.text();
    const requestId = upstream.headers.get("x-request-id") ?? undefined;
    const parsed = parseVoiceCallAnswer(raw, model, requestId);
    if (!parsed.ok) {
      console.error("[CHIEF_RESIDENT_VOICE_SESSION_FAILED]", { stage: "parse", error: parsed.error });
      return res.status(502).json({ error: parsed.error, code: "malformed_response" });
    }

    return res.status(200).json(parsed.answer);
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    console.error("[CHIEF_RESIDENT_VOICE_SESSION_FAILED]", {
      stage: isTimeout ? "timeout" : "network",
      error: err instanceof Error ? err.message : String(err),
    });
    return res.status(500).json({
      error: isTimeout ? "Voice session request timed out." : "Could not reach the voice service.",
      code: isTimeout ? "timeout" : "network_error",
    });
  } finally {
    clearTimeout(timer);
  }
}
