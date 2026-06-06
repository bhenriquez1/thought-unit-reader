// lib/WhiteboardExplanationService.ts
// CLIENT-SAFE: do NOT import the OpenAI SDK here. Call your API routes instead.

export type WhiteboardDrawType =
  | "flow"        // boxes connected by arrows (cause→effect chains, pipelines)
  | "sketch"      // free-text annotation over a blank canvas
  | "equation"    // styled equation / formula box
  | "timeline"    // horizontal timeline with labeled events
  | "table"       // grid of labeled cells
  | "anatomy"     // labeled diagram (like flow but with more nodes)
  | "graph"       // bar or dot graph with labeled axes
  | "comparison"; // two-column side-by-side

export interface DiagramNode {
  id: string;
  label: string;
  /** Optional absolute position override (0..1 normalized). If absent, auto-layout applies. */
  nx?: number; // 0..1 fraction of canvas width
  ny?: number; // 0..1 fraction of canvas height
}

export interface DiagramArrow {
  from: string;   // node id
  to: string;     // node id
  label?: string; // optional edge label
}

/** A single whiteboard action the renderer understands */
export type WhiteboardStep = {
  type: "draw" | "erase" | "text" | "image";
  payload: any;
  delayMs?: number;

  /** Renderer-friendly fields (normalized below) */
  title?: string;
  description?: string;
  visualPrompt?: string;

  /** Armando diagram fields — populated by whiteboardFromStudyModel */
  drawType?: WhiteboardDrawType;
  nodes?: DiagramNode[];
  arrows?: DiagramArrow[];
  labels?: string[];         // free annotation labels (for anatomy, etc.)
  evidenceRefId?: string;    // visualAnchor.id to focus when this step plays
  spokenLine?: string;       // the line the narrator reads for this step
};

export type WhiteboardResponse = {
  steps: WhiteboardStep[];   // server may send partial; we normalize below
  narrationScript: string;

  /** Optional audio returned by server */
  audioUrl?: string;         // e.g., signed/public URL
  audioBase64?: string;      // base64 payload
  audioMime?: string;        // e.g. "audio/mpeg"
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
    if (typeof (payload as any)[k] === "string" && (payload as any)[k].trim()) return (payload as any)[k];
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
      (payload && (payload as any).prompt) ||
      (payload && (payload as any).caption) ||
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

/** Minimal local fallback if API is down or quota exceeded */
function localFallback(concept: string, context: string): {
  steps: WhiteboardStep[];
  narrationScript: string;
} {
  const c = (concept || "").trim();
  const x = (context || "").trim();
  const steps: WhiteboardStep[] = normalizeSteps([
    { title: "Big Picture",  type: "text",  payload: { text: `${x || "This section"} — why this matters.` } },
    { title: "Core Idea",    type: "text",  payload: { text: c.slice(0, 200) } },
    { title: "Visual Sketch",type: "draw",  payload: { prompt: "Simple diagram with 2–4 labeled parts." } },
    { title: "Common Pitfall",type:"text",  payload: { text: "A frequent misconception and how to avoid it." } },
    { title: "Apply It",     type: "text",  payload: { text: "Where this shows up in practice/exams." } },
  ]);
  const narrationScript = steps.map((s) => `${s.title}: ${s.description || ""}`).join("\n");
  return { steps, narrationScript };
}

/** Try the new route first, then the legacy one (back-compat) */
async function postExplain(
  concept: string,
  context: string,
  studyModel?: object | null,
  pageText?: string,
): Promise<Response> {
  const body = JSON.stringify({ concept, context, studyModel: studyModel ?? null, pageText: pageText ?? "" });

  // New route
  const r1 = await fetch("/api/whiteboard-explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (r1.ok) return r1;

  // Legacy route
  const r2 = await fetch("/api/whiteboard-explanation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  return r2;
}

/* ----------------------------- public API ---------------------------- */

/** Get steps + narration only (no audio resolution). */
export async function generateWhiteboardExplanation(
  concept: string,
  context: string,
  studyModel?: object | null,
  pageText?: string,
): Promise<{ steps: WhiteboardStep[]; narrationScript: string }> {
  try {
    const res = await postExplain(concept, context, studyModel, pageText);
    if (!res.ok) {
      const fb = localFallback(concept, context);
      return { steps: fb.steps, narrationScript: fb.narrationScript };
    }
    const data: WhiteboardResponse = await res.json();
    return {
      steps: normalizeSteps(data.steps),
      narrationScript: data.narrationScript || "",
    };
  } catch {
    const fb = localFallback(concept, context);
    return { steps: fb.steps, narrationScript: fb.narrationScript };
  }
}

/**
 * Get steps + narration and resolve audio into a Blob if available.
 * Order:
 *   1) Use server-provided audioUrl (fetch) or audioBase64.
 *   2) If absent, try your /api/tts route with the narrationScript.
 *   3) If that fails, return audioBlob: null (let the renderer use browser TTS).
 */
export async function generateWhiteboardExplanationWithAudio(
  concept: string,
  context: string,
  studyModel?: object | null,
  pageText?: string,
): Promise<WhiteboardResult> {
  try {
    const res = await postExplain(concept, context, studyModel, pageText);
    if (!res.ok) {
      const fb = localFallback(concept, context);
      return { steps: fb.steps, narrationScript: fb.narrationScript, audioBlob: null };
    }

    const data: WhiteboardResponse = await res.json();
    const steps = normalizeSteps(data.steps);
    const narrationScript = data.narrationScript || "";

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
      // Optional server TTS (if you have /api/tts set up)
      try {
        const tts = await fetch("/api/tts?return=raw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
  } catch {
    const fb = localFallback(concept, context);
    return { steps: fb.steps, narrationScript: fb.narrationScript, audioBlob: null };
  }
}