// lib/WhiteboardExplanationService.ts
// CLIENT-SAFE: do NOT import the OpenAI SDK here. Call your API routes instead.

export type WhiteboardStep = {
  /** Discrete action that your <Whiteboard /> understands */
  type: "draw" | "erase" | "text" | "image";
  /** Payload is renderer-specific (e.g., path points, text content, image URL, etc.) */
  payload: any;
  /** Optional delay override per step */
  delayMs?: number;
};

export type WhiteboardResponse = {
  steps: WhiteboardStep[];
  narrationScript: string;
  /** Server may return one of these for audio */
  audioUrl?: string;      // e.g. a signed URL or public path
  audioBase64?: string;   // base64-encoded audio
  audioMime?: string;     // e.g. "audio/mpeg"
};

function b64ToBlob(b64: string, mime = "audio/mpeg"): Blob {
  const byteString = atob(b64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new Blob([ab], { type: mime });
}

/**
 * Hit our server route that talks to OpenAI securely; resolve audio to a Blob if available.
 * If the server doesn't attach audio, we fall back to /api/tts (using `script`).
 */
export async function generateWhiteboardExplanationWithAudio(
  concept: string,
  context: string
): Promise<{ steps: WhiteboardStep[]; narrationScript: string; audioBlob: Blob | null }> {
  // 1) Ask the server to build the explanation + (optionally) audio
  const res = await fetch("/api/whiteboard-explanation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ concept, context }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`whiteboard-explanation failed: ${msg}`);
  }

  const data: WhiteboardResponse = await res.json();

  let audioBlob: Blob | null = null;

  // 2) Prefer server-provided audioUrl
  if (data.audioUrl) {
    try {
      const a = await fetch(data.audioUrl);
      audioBlob = await a.blob();
    } catch {
      audioBlob = null;
    }
  }
  // 3) Or server-provided audioBase64
  else if (data.audioBase64) {
    try {
      audioBlob = b64ToBlob(data.audioBase64, data.audioMime || "audio/mpeg");
    } catch {
      audioBlob = null;
    }
  }
  // 4) Fallback: synthesize via /api/tts using the narrationScript
  else if (data.narrationScript) {
    try {
      const tts = await fetch("/api/tts?return=raw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // IMPORTANT: our /api/tts expects { script, voice?, format? }
        body: JSON.stringify({ script: data.narrationScript, voice: "alloy", format: "mp3" }),
      });
      if (tts.ok) {
        const buf = await tts.arrayBuffer();
        audioBlob = new Blob([buf], { type: "audio/mpeg" });
      }
    } catch {
      audioBlob = null;
    }
  }

  return {
    steps: Array.isArray(data.steps) ? data.steps : [],
    narrationScript: data.narrationScript || "",
    audioBlob,
  };
}