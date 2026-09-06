// pages/api/chief-resident-voice-session.ts
// CR2 — mints a short-lived OpenAI Realtime API session for a Chief
// Resident voice call. The real OPENAI_API_KEY is read server-side only
// and never returned to the client; the client receives an ephemeral
// client_secret (single-session, short expiry) and uses it to open its own
// WebRTC connection directly to OpenAI (see
// lib/chiefResident/useChiefResidentVoiceSession.ts).
//
// See lib/chiefResident/chiefResidentVoiceAgent.ts for the pure
// request/response shaping this route wraps.

import type { NextApiRequest, NextApiResponse } from "next";
import {
  buildVoiceSessionRequest,
  parseVoiceSessionResponse,
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

interface RequestBody extends VoiceSessionSourceContext {}

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
    const upstream = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: ctrl.signal,
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      console.error("[CHIEF_RESIDENT_VOICE_SESSION_FAILED]", { stage: "upstream", status: upstream.status, body: text.slice(0, 500) });
      return res.status(502).json({ error: "Could not start a live voice session.", code: "upstream_error" });
    }

    const raw = await upstream.json();
    const parsed = parseVoiceSessionResponse(raw, model, voice);
    if (!parsed.ok) {
      console.error("[CHIEF_RESIDENT_VOICE_SESSION_FAILED]", { stage: "parse", error: parsed.error });
      return res.status(502).json({ error: parsed.error, code: "malformed_response" });
    }

    return res.status(200).json(parsed.session);
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
