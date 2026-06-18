// lib/speech/speechController.ts
//
// Single shared speech controller. Every speech-triggering surface in the
// live app (StudySpeechPanel, ExplainStepChat, PodcastLab, Whiteboard) must
// route through this module before starting any new audio/utterance.
//
// Why this exists: each of those components used to manage its own
// audioRef/utteranceRef independently. window.speechSynthesis.cancel() only
// stops browser TTS utterances — it does nothing to another component's
// HTMLAudioElement playing an OpenAI TTS blob. So two components could each
// "correctly" stop their own previous speech and still overlap with each
// other. This module is the one place that knows about every active
// audio/utterance regardless of which component created it, so a new claim
// can always force-stop whatever came before — including across components.
//
// Not React state on purpose: speech ownership must be resolved
// synchronously, before any render, the instant a new play is requested.

export type SpeechOwner = "study-speech" | "explain-step" | "podcast-lab" | "whiteboard";

interface ActiveSpeechHandle {
  token: number;
  owner: SpeechOwner;
  audio: HTMLAudioElement | null;
  utterance: SpeechSynthesisUtterance | null;
  onForceStop: (() => void) | null;
}

let tokenSeq = 0;
let active: ActiveSpeechHandle | null = null;

// Without this, navigating away from the tab mid-speech leaves browser TTS
// (and any OpenAI TTS <audio> element) playing silently in the background;
// coming back to the tab can then make it sound like two utterances
// overlapped, when really one just kept running unseen the whole time.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAllSpeech("tab-hidden");
  });
}

function log(tag: string, detail?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console
  console.log(`${tag}`, detail ?? "");
}

// Chrome has a long-standing bug where speechSynthesis.cancel() doesn't
// reliably stop an in-flight utterance immediately — the previous voice can
// keep speaking for a moment, overlapping the next one. pause() forces the
// engine to actually halt output before cancel() clears the queue, and a
// second cancel() catches the case where cancel() itself got dropped while
// the engine was mid-utterance. This is the standard workaround for that bug.
function hardCancelUtterance(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  try {
    if (synth.speaking || synth.pending) synth.pause();
  } catch {
    // ignore
  }
  try {
    synth.cancel();
  } catch {
    // ignore
  }
  try {
    if (synth.speaking || synth.pending) synth.cancel();
  } catch {
    // ignore
  }
}

function forceStopActive(reason: string): void {
  if (!active) return;
  const prev = active;
  active = null;
  try {
    prev.audio?.pause();
  } catch {
    // ignore - element may already be detached
  }
  if (prev.utterance) hardCancelUtterance();
  try {
    prev.onForceStop?.();
  } catch {
    // ignore - owner's cleanup should never crash the controller
  }
  log("[SPEECH_CANCEL_ALL_PREVIOUS]", { previousOwner: prev.owner, reason });
}

// Call before starting any new speech. Force-stops whatever is currently
// playing (from any owner, including the same one) and returns a fresh
// token. Callers must check isSpeechStale(token) before acting on any async
// result (TTS fetch, voices-changed event, etc).
export function claimSpeech(owner: SpeechOwner): number {
  log("[SPEECH_REQUEST]", { owner });
  forceStopActive(`new request from ${owner}`);
  const token = ++tokenSeq;
  active = { token, owner, audio: null, utterance: null, onForceStop: null };
  return token;
}

// Logged by a caller's own isStartingRef guard when it blocks a re-entrant
// click — kept here so the tag is defined in one place.
export function logBlockedDuplicate(owner: SpeechOwner): void {
  log("[SPEECH_BLOCKED_DUPLICATE_REQUEST]", { owner });
}

export function isSpeechStale(token: number): boolean {
  return active?.token !== token;
}

// Registers the HTMLAudioElement backing this token so a later claim from
// any component can pause it directly, and an optional onForceStop callback
// for owner-specific cleanup (clearing intervals, resetting UI state, etc).
export function registerActiveAudio(
  token: number,
  audio: HTMLAudioElement,
  onForceStop?: () => void
): void {
  if (isSpeechStale(token) || !active) return;
  active.audio = audio;
  if (onForceStop) active.onForceStop = onForceStop;
  log("[SPEECH_CREATE_UTTERANCE]", { owner: active.owner, kind: "audio" });
}

export function registerActiveUtterance(
  token: number,
  utterance: SpeechSynthesisUtterance,
  onForceStop?: () => void
): void {
  if (isSpeechStale(token) || !active) return;
  active.utterance = utterance;
  if (onForceStop) active.onForceStop = onForceStop;
  log("[SPEECH_CREATE_UTTERANCE]", { owner: active.owner, kind: "utterance" });
}

// Call when an audio/utterance actually starts producing sound (onplay /
// onstart). Skipped if a newer claim has already superseded this token.
export function notifySpeechStart(token: number, owner: SpeechOwner): void {
  if (isSpeechStale(token)) return;
  log("[SPEECH_START]", { owner });
}

// Marks the token's speech as finished without force-stopping anything else
// — call this from onend/explicit stop so a still-current token doesn't keep
// referencing a dead audio/utterance.
export function notifySpeechEnd(token: number, owner: SpeechOwner): void {
  if (isSpeechStale(token)) return;
  log("[SPEECH_END]", { owner });
  releaseSpeech(token);
}

export function notifySpeechError(token: number, owner: SpeechOwner, error: string): void {
  if (isSpeechStale(token)) return;
  log("[SPEECH_ERROR]", { owner, error });
  releaseSpeech(token);
}

export function releaseSpeech(token: number): void {
  if (active?.token === token) {
    active = null;
  }
}

// Explicit Stop / panel-close / unmount / mode-switch. Stops whatever is
// active regardless of token, with no new claim replacing it.
export function stopAllSpeech(reason: string): void {
  forceStopActive(reason);
  hardCancelUtterance();
}

export function getActiveOwner(): SpeechOwner | null {
  return active?.owner ?? null;
}

export { log as speechLog };
