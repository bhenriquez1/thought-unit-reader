// lib/tts.ts
// Server-route–first TTS utility for generating narrated audio blobs.
// Your Next API route should live at /api/tts and return either raw audio
// (ArrayBuffer) OR JSON { audioBase64, mimeType }.

export type TTSVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
export type TTSFormat = "mp3" | "wav" | "ogg";

export interface TTSOptions {
  voice?: TTSVoice;
  format?: TTSFormat;
  /** Optional AbortSignal if caller wants cancellation control */
  signal?: AbortSignal;
  /** Optional request timeout (ms). If exceeded, returns null. */
  timeoutMs?: number;
  /** Optional base path (useful if the app isn’t hosted at root). Defaults to "" */
  basePath?: string;
}

/**
 * synthesizeVoiceFromText
 * Calls /api/tts to get an audio Blob. If the route isn't available or fails,
 * this returns null so callers can fall back to browser TTS.
 */
export async function synthesizeVoiceFromText(
  script: string,
  { voice = "alloy", format = "mp3", signal, timeoutMs, basePath = "" }: TTSOptions = {}
): Promise<Blob | null> {
  if (!script || typeof script !== "string") {
    throw new Error("TTS: 'script' must be a non-empty string.");
  }

  const controller = timeoutMs ? new AbortController() : undefined;
  const timer =
    timeoutMs &&
    setTimeout(() => {
      controller?.abort();
    }, timeoutMs);

  try {
    const res = await fetch(`${basePath}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // prefer caller-provided signal, else use timeout controller
      signal: signal ?? controller?.signal,
      body: JSON.stringify({ script, voice, format }),
    });

    if (!res.ok) {
      // Let caller decide whether to use browser TTS
      return null;
    }

    const contentType = res.headers.get("content-type") || "";

    // If API returns raw audio bytes (e.g., audio/mpeg)
    if (!contentType.includes("application/json")) {
      const buf = await res.arrayBuffer();
      const mime = contentType || mimeFromFormat(format);
      return new Blob([buf], { type: mime });
    }

    // Or, if API returns JSON with base64 (support a couple shapes)
    const data = (await res.json()) as
      | { audioBase64?: string; mimeType?: string; error?: string }
      | { audio_base64?: string; mime_type?: string; error?: string };

    if ("error" in data && data.error) {
      return null;
    }

    const b64 = (data as any).audioBase64 ?? (data as any).audio_base64;
    if (!b64) return null;

    const mime = (data as any).mimeType ?? (data as any).mime_type ?? mimeFromFormat(format);
    return base64ToBlob(b64, mime);
  } catch {
    // Network error, route missing, or aborted
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Quick check if the server route is reachable (optional) */
export async function hasServerTTS(basePath = ""): Promise<boolean> {
  try {
    const res = await fetch(`${basePath}/api/tts`, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Utility: Convert a base64 string (no data: prefix) to Blob */
export function base64ToBlob(base64: string, mimeType = "audio/mpeg"): Blob {
  const byteChars = atob(base64);
  const byteNums = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
  const byteArray = new Uint8Array(byteNums);
  return new Blob([byteArray], { type: mimeType });
}

/** Utility: Guess MIME from format */
export function mimeFromFormat(format: TTSFormat): string {
  switch (format) {
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    default:
      return "audio/mpeg";
  }
}

/** Optional helper: quick audio element player */
export function playAudioBlob(blob: Blob): HTMLAudioElement {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  audio.play().catch(() => null);
  return audio;
}