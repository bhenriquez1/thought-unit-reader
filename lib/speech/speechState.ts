// lib/speech/speechState.ts
//
// Shared playback lifecycle state, one vocabulary used by every speech
// surface instead of each one loosely inferring "am I playing?" from
// whether an HTMLAudioElement/SpeechSynthesisUtterance ref currently exists.
// That ref-existence inference is exactly what let RC4/RC5 (Speech Engine
// audit) slip through on components/whiteboard/TldrawCanvas.tsx: a boolean
// `isPlaying` had no way to distinguish "actively producing sound," "fetch
// in flight, nothing to play yet," and "was forcibly stopped by another
// owner" — so the UI could get stuck showing one of those while the real
// state was a different one.
//
//   idle     — nothing queued, nothing playing.
//   loading  — a segment's TTS request is in flight; no audio/utterance to
//              act on yet (this is the window RC5's pause-during-fetch bug
//              lived in).
//   playing  — audio/utterance is actively producing sound.
//   paused   — playback (or a not-yet-started fetch, per pauseRequestedRef in
//              each owner) is intentionally held; resume continues it.
//   stopping — a LATER claim from a different owner force-stopped this
//              owner's speech out from under it (RC4) — distinct from idle,
//              which means "deliberately at rest," not "interrupted."
//   error    — playback could not proceed at all (e.g. browser speech
//              synthesis unavailable) and no further fallback exists.
export type SpeechState = "idle" | "loading" | "playing" | "paused" | "stopping" | "error";
