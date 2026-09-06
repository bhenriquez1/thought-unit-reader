"use client";
// lib/chiefResident/useChiefResidentVoiceSession.ts
// CR2 — owns the actual WebRTC connection to OpenAI's Realtime API: mic
// capture, peer connection, data channel, remote audio playback. Mirrors
// components/whiteboard/TldrawCanvas.tsx's role as the "thin adapter" that
// owns live browser resources around a pure decision module —
// chiefResidentVoiceAgent.ts never touches any of this directly.
//
// Registers with lib/speech/speechController.ts on connect (claims the
// single shared "is anything speaking right now" slot) and releases on
// disconnect, so a live voice call and page narration/other TTS can never
// talk over each other — the same discipline every other speech-producing
// surface in this app already follows.
//
// CR3 — also handles the Realtime API's function-call events for the two
// delegation tools declared in buildVoiceSessionRequest
// (chiefResidentAgent.ts's REALTIME_DELEGATION_TOOLS). Validation and the
// once-per-session offer gate are the pure agent module's job
// (parseRealtimeDelegationToolCall/shouldOfferDelegation) — this hook only
// owns reading the event off the data channel and sending the required
// function_call_output/response.create acknowledgement back so the model's
// turn continues naturally, exactly the "thin adapter" split every other
// agent module in this codebase follows.
//
// Could not be exercised end-to-end in this sandbox: there is no real
// microphone/WebRTC environment here, and no OPENAI_API_KEY to actually
// reach the Realtime API. This file is exercised only by TypeScript's own
// checking and by source-inspection wiring tests
// (tests/chiefResident/chiefResidentVoiceWiring.test.ts) — not by a live
// call. The exact function-call event shape read below (response.output_
// item.done carrying a "function_call" item) reflects OpenAI's documented
// Realtime API behavior but is likewise unverified against a live session.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  claimSpeech,
  registerActiveAudio,
  notifySpeechStart,
  notifySpeechEnd,
  notifySpeechError,
  isSpeechStale,
} from "@/lib/speech/speechController";
import {
  parseRealtimeDelegationToolCall,
  shouldOfferDelegation,
  type ChiefResidentDelegation,
  type ChiefResidentDelegationTarget,
} from "./chiefResidentAgent";
import type { VoiceSessionSourceContext } from "./chiefResidentVoiceAgent";

const SPEECH_OWNER = "chief-resident-voice" as const;
const REALTIME_BASE_URL = "https://api.openai.com/v1/realtime";

export type VoiceCallStatus = "idle" | "connecting" | "connected" | "error" | "ended";

export interface VoiceTranscriptEntry {
  role: "user" | "assistant";
  text: string;
}

export interface UseChiefResidentVoiceSessionResult {
  status: VoiceCallStatus;
  error: string | null;
  transcript: VoiceTranscriptEntry[];
  isMuted: boolean;
  /** CR3 — set at most once per target per call (see shouldOfferDelegation),
   *  the same delegation contract the text mode uses. */
  delegation: ChiefResidentDelegation | null;
  connect: (ctx: VoiceSessionSourceContext) => Promise<void>;
  disconnect: () => void;
  toggleMute: () => void;
}

interface VoiceSessionCredentialsResponse {
  clientSecret: string;
  model: string;
}

export function useChiefResidentVoiceSession(): UseChiefResidentVoiceSessionResult {
  const [status, setStatus] = useState<VoiceCallStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<VoiceTranscriptEntry[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [delegation, setDelegation] = useState<ChiefResidentDelegation | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const tokenRef = useRef<number | null>(null);
  const assistantBufferRef = useRef<string>("");
  // CR3 — same once-per-target-per-session discipline as the text mode's
  // offeredDelegationsRef (components/notelab/ChiefResidentPanel.tsx), kept
  // as a separate set here since a text session and a voice call never
  // share React state.
  const offeredDelegationsRef = useRef<Set<ChiefResidentDelegationTarget>>(new Set());

  const cleanup = useCallback(() => {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    pcRef.current?.getSenders().forEach((sender) => sender.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.srcObject = null;
    }
    if (tokenRef.current !== null) {
      notifySpeechEnd(tokenRef.current, SPEECH_OWNER);
      tokenRef.current = null;
    }
  }, []);

  // Unmount safety net — a student closing the panel/navigating away must
  // never leave a live mic connection open in the background.
  useEffect(() => () => cleanup(), [cleanup]);

  const disconnect = useCallback(() => {
    cleanup();
    setStatus("ended");
  }, [cleanup]);

  // CR3 — sends a client event over the data channel (function_call_output
  // acknowledgement, then response.create) so the model's turn continues
  // naturally instead of hanging after it invokes a delegation tool.
  const sendDataChannelEvent = useCallback((event: Record<string, unknown>) => {
    if (dataChannelRef.current?.readyState !== "open") return;
    dataChannelRef.current.send(JSON.stringify(event));
  }, []);

  // CR3 — a delegation tool call always gets acknowledged back to the model
  // (so it can narrate what just happened and keep talking), regardless of
  // whether this module actually offers it to the student — only the
  // ACKNOWLEDGEMENT differs, mirroring how a malformed [[DELEGATE: ...]]
  // directive in the text mode is still stripped even when no delegation
  // results (resolveChiefResidentTurn's fail-closed behavior).
  const acknowledgeToolCall = useCallback((callId: string, output: Record<string, unknown>) => {
    sendDataChannelEvent({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: callId, output: JSON.stringify(output) },
    });
    sendDataChannelEvent({ type: "response.create" });
  }, [sendDataChannelEvent]);

  const handleDataChannelMessage = useCallback((event: MessageEvent) => {
    let msg: {
      type?: string;
      delta?: string;
      transcript?: string;
      item?: { type?: string; name?: string; arguments?: string; call_id?: string };
    };
    try {
      msg = JSON.parse(event.data);
    } catch {
      return; // non-JSON frame — ignore rather than crash the call
    }
    // Realtime API event vocabulary — only surface what this minimal
    // caption UI needs; every other event type is ignored, not an error.
    if (msg.type === "response.audio_transcript.delta" && typeof msg.delta === "string") {
      assistantBufferRef.current += msg.delta;
    } else if (msg.type === "response.audio_transcript.done") {
      const text = assistantBufferRef.current.trim();
      assistantBufferRef.current = "";
      if (text) setTranscript((prev) => [...prev, { role: "assistant", text }]);
    } else if (msg.type === "conversation.item.input_audio_transcription.completed" && typeof msg.transcript === "string") {
      const text = msg.transcript.trim();
      if (text) setTranscript((prev) => [...prev, { role: "user", text }]);
    } else if (msg.type === "response.output_item.done" && msg.item?.type === "function_call") {
      const { name, arguments: rawArguments, call_id: callId } = msg.item;
      if (typeof name !== "string" || typeof rawArguments !== "string" || typeof callId !== "string") return;
      const parsed = parseRealtimeDelegationToolCall(name, rawArguments);
      if (!parsed) {
        acknowledgeToolCall(callId, { status: "not_offered", reason: "malformed_or_unrecognized" });
        return;
      }
      if (!shouldOfferDelegation(parsed.target, offeredDelegationsRef.current)) {
        acknowledgeToolCall(callId, { status: "not_offered", reason: "already_offered_this_session" });
        return;
      }
      offeredDelegationsRef.current.add(parsed.target);
      setDelegation(parsed);
      acknowledgeToolCall(callId, { status: "offered_to_student" });
    } else if (msg.type === "error") {
      console.error("[CHIEF_RESIDENT_VOICE_REALTIME_ERROR]", msg);
    }
  }, [acknowledgeToolCall]);

  const connect = useCallback(async (ctx: VoiceSessionSourceContext) => {
    if (status === "connecting" || status === "connected") return;
    setStatus("connecting");
    setError(null);
    setTranscript([]);
    setDelegation(null);
    offeredDelegationsRef.current = new Set();

    // claimSpeech() force-stops any narration/TTS currently playing
    // anywhere else in the app (same discipline as ExplainStepChat's own
    // claimSpeech call) — a live voice call always wins the shared audio
    // channel the instant it starts connecting.
    const token = claimSpeech(SPEECH_OWNER);
    tokenRef.current = token;

    try {
      const sessionRes = await fetch("/api/chief-resident-voice-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ctx),
      });
      if (!sessionRes.ok) {
        const errBody = await sessionRes.json().catch(() => ({} as { error?: string }));
        throw new Error(errBody.error || `Could not start voice session (${sessionRes.status})`);
      }
      const session = (await sessionRes.json()) as VoiceSessionCredentialsResponse;

      if (isSpeechStale(token)) return; // superseded by a newer claim while awaiting the fetch

      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (isSpeechStale(token)) {
        mic.getTracks().forEach((track) => track.stop());
        return;
      }
      micStreamRef.current = mic;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      mic.getTracks().forEach((track) => pc.addTrack(track, mic));

      const audioEl = audioElRef.current ?? new Audio();
      audioEl.autoplay = true;
      audioElRef.current = audioEl;
      pc.ontrack = (event) => {
        audioEl.srcObject = event.streams[0];
        registerActiveAudio(token, audioEl, () => cleanup());
        notifySpeechStart(token, SPEECH_OWNER);
      };

      const dc = pc.createDataChannel("oai-events");
      dc.addEventListener("message", handleDataChannelMessage);
      dataChannelRef.current = dc;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(`${REALTIME_BASE_URL}?model=${encodeURIComponent(session.model)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });
      if (!sdpRes.ok) throw new Error(`Voice connection was rejected (${sdpRes.status}).`);
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      if (isSpeechStale(token)) {
        cleanup();
        return;
      }
      setStatus("connected");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      notifySpeechError(token, SPEECH_OWNER, message);
      cleanup();
      setStatus("error");
      setError(message);
    }
  }, [status, cleanup, handleDataChannelMessage]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      micStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
      return next;
    });
  }, []);

  return { status, error, transcript, isMuted, delegation, connect, disconnect, toggleMute };
}
