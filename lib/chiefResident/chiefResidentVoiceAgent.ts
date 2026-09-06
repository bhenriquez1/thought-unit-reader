// lib/chiefResident/chiefResidentVoiceAgent.ts
// CR2 — the Chief Resident Agent's realtime voice loop, first pass: a live,
// spoken conversation with the same teaching persona/content-grounding
// discipline as the text mode (components/notelab/ChiefResidentPanel.tsx),
// using OpenAI's Realtime API over WebRTC.
//
// Deliberately does NOT forward CR1's [[DELEGATE: ...]] directive
// convention over voice yet (see chiefResidentAgent.ts) — the Realtime
// API has its own native tool-calling mechanism (function definitions
// passed at session-creation time, invoked mid-conversation via
// data-channel events), which is a different shape than CR1's
// text-parsed trailing-line convention and needs its own design pass.
//
// Standard OpenAI Realtime-over-WebRTC pattern, followed here:
//   1. The client asks OUR server for a short-lived ephemeral session (this
//      module's buildVoiceSessionRequest/parseVoiceSessionResponse, wrapped
//      by pages/api/chief-resident-voice-session.ts) — the real
//      OPENAI_API_KEY never leaves the server.
//   2. The client opens an RTCPeerConnection directly to OpenAI's Realtime
//      API, authenticated with that ephemeral token. This module never
//      touches that connection itself — see
//      lib/chiefResident/useChiefResidentVoiceSession.ts for the
//      caller-owned WebRTC lifecycle, mirroring how whiteboardArtistAgent.ts
//      never touches the live tldraw Editor.
//
// Pure here means: request/response shaping only. No fetch, no WebRTC, no
// browser APIs — those stay the caller's job.

import type { TeachingAudience } from "@/pages/api/chief-resident-teaching";

export const DEFAULT_VOICE_MODEL = "gpt-realtime";
export const DEFAULT_VOICE = "marin";

export interface VoiceSessionSourceContext {
  /** Full source text for the current page — same content-authority
   *  discipline as the text mode's sourceText (see chief-resident-teaching.ts's
   *  CONTENT_AUTHORITY block): the model must never introduce a domain,
   *  diagnosis, or example unsupported by this text. */
  sourceText: string;
  title?: string;
  pageNumber?: number;
  audience?: TeachingAudience;
}

/**
 * Pure. Adapts BASE_SYSTEM's persona-detection/Socratic-teaching rules
 * (chief-resident-teaching.ts) for SPOKEN conversation: no emoji, no
 * markdown headers, no "📋 Before Rounds" formatting — nothing here ever
 * renders visually. Turn-taking itself (when the student can speak, when
 * the model responds) is handled by the Realtime API's own server-side
 * voice-activity detection, not by these instructions.
 */
export function buildVoiceSessionInstructions(ctx: VoiceSessionSourceContext): string {
  const header = ctx.title ? `Document: "${ctx.title}"\n` : "";
  const pageNote = ctx.pageNumber ? `Page: ${ctx.pageNumber}\n` : "";
  const audienceNote = ctx.audience && ctx.audience !== "student"
    ? `\nThe learner's level is "${ctx.audience}" — adjust vocabulary and depth accordingly, but never let it override the subject matter below.`
    : "";

  return `You are an adaptive AI tutor having a live SPOKEN conversation. You teach interactively from the content given to you.

CONTENT AUTHORITY: The page content below is authoritative. Never introduce a professional domain, diagnosis, procedure, or example that is not directly supported by it.

SPOKEN FORMAT — this is audio, not text:
- Never use markdown, emoji, bullet points, or headers — say everything as natural spoken sentences.
- Keep each turn short (2-4 sentences) — this is a conversation, not a lecture.
- Ask ONE question at a time, then stop and wait for the student to answer. Never answer your own question.
- Detect the subject from the content and adapt your teaching voice to it (a Chief Resident for medicine/dentistry, a professor for science, a Socratic guide for humanities, and so on), but say this naturally in conversation rather than announcing a persona.
- Judge the student's reasoning, not just whether their answer is correct, and build on what they say.
- Be direct. Never say "Great question!" or "Great answer!".
${audienceNote}

${header}${pageNote}
Page content to teach from:

${ctx.sourceText}`;
}

export interface RealtimeTurnDetectionConfig {
  type: "server_vad";
  threshold: number;
  silence_duration_ms: number;
  create_response: true;
  interrupt_response: true;
}

export interface RealtimeSessionRequestBody {
  type: "realtime";
  model: string;
  output_modalities: ["audio"];
  instructions: string;
  audio: {
    input: {
      transcription: { model: "gpt-4o-mini-transcribe" };
      turn_detection: RealtimeTurnDetectionConfig;
    };
    output: { voice: string };
  };
}

export interface VoiceSessionRequestOptions {
  model?: string;
  voice?: string;
}

/** Pure. Builds the exact JSON body POSTed to OpenAI's Realtime session
 *  endpoint (see pages/api/chief-resident-voice-session.ts). */
export function buildVoiceSessionRequest(
  ctx: VoiceSessionSourceContext,
  opts?: VoiceSessionRequestOptions,
): RealtimeSessionRequestBody {
  return {
    type: "realtime",
    model: opts?.model || DEFAULT_VOICE_MODEL,
    output_modalities: ["audio"],
    instructions: buildVoiceSessionInstructions(ctx),
    audio: {
      input: {
        transcription: { model: "gpt-4o-mini-transcribe" },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          silence_duration_ms: 600,
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: opts?.voice || DEFAULT_VOICE },
    },
  };
}

export interface VoiceCallAnswer {
  /** SDP answer only. Authentication remains on Avrrio's server. */
  answerSdp: string;
  model: string;
  requestId?: string;
}

export type VoiceCallAnswerParseResult =
  | { ok: true; answer: VoiceCallAnswer }
  | { ok: false; error: string };

/**
 * Pure. Validates the SDP answer before handing it to the browser. OpenAI's
 * standard API key and the full upstream response never leave the server.
 */
export function parseVoiceCallAnswer(
  raw: unknown,
  requestedModel: string,
  requestId?: string,
): VoiceCallAnswerParseResult {
  if (typeof raw !== "string" || !raw.trim().startsWith("v=")) {
    return { ok: false, error: "Realtime call endpoint did not return a valid SDP answer." };
  }
  return { ok: true, answer: { answerSdp: raw, model: requestedModel, requestId } };
}
