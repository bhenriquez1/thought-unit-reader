// lib/WhiteboardExplanationService.ts
// CLIENT-SAFE: do NOT import the OpenAI SDK here. Call your API routes instead.

/** A single whiteboard action the renderer understands */
export type WhiteboardStep = {
  type: "draw" | "erase" | "text" | "image";
  payload: any;
  delayMs?: number;

  /** Legacy/renderer-friendly fields (optional on the wire, required by UI) */
  title?: string;
  description?: string;
  visualPrompt?: string;
};

export type WhiteboardResponse = {
  steps: WhiteboardStep[];
  narrationScript: string;

  /** Optional audio returned by server */
  audioUrl?: string;      // e.g. signed/public URL
  audioBase64?: string;   // base64 payload
  audioMime?: string;     // e.g. "audio/mpeg"
};

export type WhiteboardResult = {
  steps: WhiteboardStep[];
  narrationScript: string;
  audioBlob: Blob | null;
};

/* ------------------------------- utils ------------------------------- */

function b64ToBlob(b64: string, mime = "audio/mpeg"): Blob {
  const byteString = atob(b64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new Blob([ab], { type: mime });
}

/** Try to produce human-friendly text from any step payload */
function describePayload(payload: any): string {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload === "number" || typeof payload === "boolean") return String(payload);

  // common fields we might see
  for (const k of ["text", "caption", "prompt", "label", "description"]) {
    if (typeof payload[k] === "string" && payload[k].trim()) return payload[k];
  }
  // fall back to a compact JSON
  try {
    return JSON.stringify(payload);
  } catch {
    return "";
  }
}

/** Normalize steps so the renderer always has title/description/visualPrompt */
function normalizeSteps(raw: any[] | undefined): WhiteboardStep[] {
  const steps = Array.isArray(raw) ? raw : [];
  return steps.map((s, i) => {
    const payload = s?.payload ?? {};
    const description =
      (typeof s?.description === "string" && s.description) || describePayload(payload) || "";
    const visualPrompt =
      (typeof s?.visualPrompt === "string" && s.visualPrompt) ||
      payload?.prompt ||
      payload?.caption ||
      "";

    return {
      type: (s?.type as WhiteboardStep["type"]) ?? "draw",
      payload,
      delayMs: typeof s?.delayMs === "number" ? s.delayMs : undefined,
      title: typeof s?.title === "string" && s.title ? s.title : `Step ${i + 1}`,
      description,
      visualPrompt: typeof visualPrompt === "string" ? visualPrompt : "",
    };
  });
}

/* ----------------------------- public API ---------------------------- */

/** Get steps + narration only (no audio resolution). */
export async function generateWhiteboardExplanation(
  concept: string,
  context: string
): Promise<{ steps: WhiteboardStep[]; narrationScript: string }> {
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
  return {
    steps: normalizeSteps(data.steps),
    narrationScript: data.narrationScript || "",
  };
}

/**
 * Get steps + narration and resolve audio into a Blob if available.
 * If the server didn’t include audio, falls back to /api/tts using the narration script.
 */
export async function generateWhiteboardExplanationWithAudio(
  concept: string,
  context: string
): Promise<WhiteboardResult> {
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

  // Normalize for the renderer
  const steps = normalizeSteps(data.steps);
  const narrationScript = data.narrationScript || "";

  // Resolve audio (server-provided first)
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
  } else if (narrationScript) {
    // Fallback to server TTS route
    try {
      const tts = await fetch("/api/tts?return=raw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // our /api/tts expects { script, voice?, format? }
        body: JSON.stringify({ script: narrationScript, voice: "alloy", format: "mp3" }),
      });
      if (tts.ok) {
        const buf = await tts.arrayBuffer();
        audioBlob = new Blob([buf], { type: "audio/mpeg" });
      }
    } catch {
      audioBlob = null;
    }
  }

  return { steps, narrationScript, audioBlob };
}