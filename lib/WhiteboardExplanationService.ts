// lib/WhiteboardExplanationService.ts
// CLIENT-SAFE: do NOT import the OpenAI SDK here. Call your API routes instead.

export type WhiteboardStep = {
  type: "draw" | "erase" | "text" | "image";
  payload: any;
  delayMs?: number;
};

export type WhiteboardResponse = {
  steps: WhiteboardStep[];
  narrationScript: string;
  audioUrl?: string;      // server may return a URL
  audioBase64?: string;   // or base64 audio
  audioMime?: string;     // e.g. "audio/mpeg"
};

function b64ToBlob(b64: string, mime = "audio/mpeg"): Blob {
  const byteString = atob(b64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new Blob([ab], { type: mime });
}

/** Hit our server route that talks to OpenAI securely; resolve audio to a Blob if available. */
export async function generateWhiteboardExplanationWithAudio(
  concept: string,
  context: string
): Promise<{ steps: WhiteboardStep[]; narrationScript: string; audioBlob: Blob | null }> {
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

  if (data.audioUrl) {
    try {
      const a = await fetch(data.audioUrl);
      audioBlob = await a.blob();
    } catch {
      audioBlob = null;
    }
  } else if (data.audioBase64) {
    try {
      audioBlob = b64ToBlob(data.audioBase64, data.audioMime || "audio/mpeg");
    } catch {
      audioBlob = null;
    }
  } else {
    // Optional fallback: ask /api/tts to synthesize if server didn’t attach audio
    try {
      const tts = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: data.narrationScript }),
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
    steps: data.steps || [],
    narrationScript: data.narrationScript || "",
    audioBlob,
  };
}