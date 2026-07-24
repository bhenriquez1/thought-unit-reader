// pages/api/whiteboard-image.ts
// "AI Drawing" mode for the Whiteboard — Phase 1 (director) + Phase 2 (artist):
//
//   Phase 1: GPT writes a visual teaching script (Armando Hasudungan style —
//            labeled structures, color-coded relationships, arrows, sequential
//            steps) for the given concept/context.
//   Phase 2: An image model renders that script as a hand-drawn-style
//            educational illustration.
//
// Image provider options (the "model selector" — directive item 2):
//   - "openai"        — OpenAI Images (dall-e-3). Best integration with the
//                        Explain This Step tutor flow; good for anatomy/biology/
//                        chemistry/dental visual explanations.
//   - "ideogram"      — Ideogram. Stronger for diagrams that need clean, readable
//                        text labels. Requires IDEOGRAM_API_KEY.
//   - "sdxl"          — Stable Diffusion XL via a custom endpoint. Requires
//                        SDXL_API_ENDPOINT + SDXL_API_KEY. A request may select
//                        SDXL_FINE_TUNED_ENDPOINT or any host listed in
//                        SDXL_ALLOWED_ENDPOINTS via sdxlOptions.endpoint, but
//                        never an arbitrary client-supplied URL (SSRF guard —
//                        see resolveSdxlEndpoint). Supports style preset,
//                        negative prompt, and seed for reproducible regen.
//   - "sdxlFineTuned" — Same SDXL path pointed at a fine-tuned model id
//                        (SDXL_FINE_TUNED_MODEL_ID or sdxlOptions.modelId) —
//                        the prepared path for an eventual Armando H-style
//                        fine-tune.
// Any provider that's unconfigured (missing key/endpoint) returns the same
// debug-aware `{error, aiDisabled: true}` shape rather than throwing, so the
// caller can always fall back to the SVG/canvas whiteboard instead of
// surfacing a raw provider error to the student.

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import type { DiagramPlan } from "@/lib/whiteboard/diagramPlan";
import type { WhiteboardVisualPlan } from "@/lib/whiteboard/visualPlan";

const HAS_OPENAI_KEY = !!process.env.OPENAI_API_KEY;
const openai = HAS_OPENAI_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY! }) : (null as any);

type Provider = "openai" | "ideogram" | "sdxl" | "sdxlFineTuned";

type SdxlOptions = {
  endpoint?: string;
  modelId?: string;
  stylePreset?: string;
  negativePrompt?: string;
  seed?: number;
};

type Body = {
  concept?: string;
  context?: string;
  provider?: Provider;
  debug?: boolean;
  diagramPlan?: DiagramPlan;
  /** Subject-aware visual plan — enriches the director prompt with sequence and visual type. */
  visualPlan?: WhiteboardVisualPlan;
  sdxlOptions?: SdxlOptions;
};

/** Shared style guardrail (directive item 4) — applied to every provider's
 *  prompt, and sent as the literal negative_prompt for SDXL. */
const NEGATIVE_STYLE_HINT =
  "decorative illustration, photorealism, stock-photo style, generic bullet-point text slide, watermark, clutter";

type DebugInfo = {
  failureReason: string;
  model?: string;
  promptSent?: { system: string; user: string };
  rawResponse?: string;
  httpStatus?: number;
};

function modelLabelForProvider(provider: Provider): string {
  switch (provider) {
    case "ideogram": return "ideogram-v2";
    case "sdxl": return "sdxl";
    case "sdxlFineTuned": return "sdxl-fine-tuned";
    default: return "dall-e-3";
  }
}

type Ok = {
  imageUrl: string;
  teachingScript: string;
  provider: Provider;
};

type Err = {
  error: string;
  aiDisabled?: boolean;
  debugInfo?: DebugInfo;
};

const DIRECTOR_SYSTEM_PROMPT = `You are a visual-teaching director, in the style of Armando Hasudungan's hand-drawn educational videos. Given a concept and page context, write a short "visual teaching script" describing exactly what should be drawn to teach THIS SPECIFIC concept visually — not a generic diagram.

Your script must describe:
- 3-5 key structures/objects to draw, each with a SHORT label (1-3 words) in a fixed position (e.g. "top-left", "center", "bottom-right") so labels never overlap.
- Arrows showing relationships, flow, or sequence between them, with a short verb/label on each arrow (e.g. "releases", "becomes").
- Color-coding for related elements (e.g. "carbon atoms = blue, oxygen = red").
- A left-to-right or top-to-bottom sequential layout (numbered steps 1, 2, 3...) so the diagram tells the story of this concept.

Keep it concise (under 150 words), concrete, and visual — describe shapes, positions, labels, arrows, and colors, not abstract prose. Every label must be SHORT and large enough to read. This script will be sent directly to an image-generation model.`;

async function buildTeachingScript(
  concept: string,
  context: string,
  debug: boolean,
  visualPlan?: WhiteboardVisualPlan,
): Promise<{ script: string; raw: string }> {
  const planLines: string[] = [];
  if (visualPlan) {
    planLines.push(`Visual type: ${visualPlan.visualType}`);
    planLines.push(`Subject: ${visualPlan.subject}`);
    if (visualPlan.sequence.length)
      planLines.push(`Required sequence: ${visualPlan.sequence.join(" → ")}`);
    if (visualPlan.requiredLabels.length)
      planLines.push(`Required labels: ${visualPlan.requiredLabels.join(", ")}`);
    if (visualPlan.warnings.length)
      planLines.push(`Common traps to highlight: ${visualPlan.warnings.join("; ")}`);
  }
  const userPrompt = [
    `Concept to visualize: ${concept}`,
    planLines.length ? planLines.join("\n") : null,
    context ? `Page context: ${context.slice(0, 1000)}` : null,
  ].filter(Boolean).join("\n\n");

  if (debug || process.env.NODE_ENV !== "production") {
    console.log("[WHITEBOARD_IMAGE_DIRECTOR_REQUEST]", { model: "gpt-4o-mini", concept: concept.slice(0, 120), userPromptChars: userPrompt.length });
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: DIRECTOR_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.6,
    max_tokens: 400,
  });

  const script = completion.choices?.[0]?.message?.content?.trim() ?? "";

  if (debug || process.env.NODE_ENV !== "production") {
    console.log("[WHITEBOARD_IMAGE_DIRECTOR_RESPONSE]", { scriptChars: script.length, script: script.slice(0, 500) });
  }

  return { script, raw: JSON.stringify(completion).slice(0, 4000) };
}

/** Builds the image prompt from the Director script, plus — when available —
 *  the same DiagramPlan the canvas renders, so the illustration stays
 *  accurate to the plan instead of drifting into a freeform interpretation
 *  (directive item 5, the "accuracy rule"). */
function imagePromptFromScript(script: string, concept: string, diagramPlan?: DiagramPlan): string {
  const planHints: string[] = [];
  if (diagramPlan) {
    if (diagramPlan.nodes?.length) {
      planHints.push(`Required labeled elements: ${diagramPlan.nodes.map((n) => n.label).join(", ")}.`);
    }
    if (diagramPlan.warnings?.length) {
      planHints.push(`Mark a "Watch out" callout for: ${diagramPlan.warnings.join("; ")}.`);
    }
    if (diagramPlan.memoryHooks?.length) {
      planHints.push(`Include a "Remember" box with: ${diagramPlan.memoryHooks.join("; ")}.`);
    }
  }
  return [
    `A hand-drawn educational whiteboard illustration teaching the concept: "${concept}".`,
    script,
    ...planHints,
    "Style: Armando Hasudungan style — clean black ink hand-drawn lines and simple shapes on a plain white background, like a teacher's whiteboard sketch. VERY LARGE, BOLD, CLEARLY READABLE handwritten-style text labels (short, 1-3 words each) placed next to each structure with generous spacing so NO labels overlap or touch. Bold directional arrows showing relationships, flow, and sequence between elements, each with a short label on the arrow. Use a few distinct colors (as described) to color-code related elements. Lay the diagram out left-to-right or top-to-bottom in numbered steps so it tells a clear visual story. Avoid clutter — prioritize large legible text and generous whitespace over decorative detail.",
    `Strictly avoid: ${NEGATIVE_STYLE_HINT}.`,
  ].join("\n\n");
}

async function generateWithOpenAI(prompt: string, debug: boolean): Promise<{ imageUrl: string; raw: string }> {
  const requestPayload = {
    model: "dall-e-3",
    prompt: prompt.slice(0, 4000),
    size: "1024x1024" as const,
    quality: "standard" as const,
    n: 1,
  };

  if (debug || process.env.NODE_ENV !== "production") {
    console.log("[WHITEBOARD_IMAGE_OPENAI_REQUEST]", { ...requestPayload, promptChars: requestPayload.prompt.length });
  }

  const result = await openai.images.generate(requestPayload);

  if (debug || process.env.NODE_ENV !== "production") {
    console.log("[WHITEBOARD_IMAGE_OPENAI_RESPONSE]", {
      created: result.created,
      dataCount: result.data?.length ?? 0,
      hasB64: !!result.data?.[0]?.b64_json,
      hasUrl: !!result.data?.[0]?.url,
    });
  }

  const item = result.data?.[0];
  const b64 = item?.b64_json;
  const url = item?.url;
  if (b64) {
    return { imageUrl: `data:image/png;base64,${b64}`, raw: JSON.stringify({ created: result.created, hasB64: true }) };
  }
  if (url) {
    return { imageUrl: url, raw: JSON.stringify({ created: result.created, hasUrl: true }) };
  }
  throw new Error("OpenAI image response missing both b64_json and url");
}

async function generateWithIdeogram(prompt: string, debug: boolean): Promise<{ imageUrl: string; raw: string; status: number }> {
  const requestBody = {
    image_request: {
      prompt: prompt.slice(0, 2000),
      aspect_ratio: "ASPECT_1_1",
      model: "V_2",
      magic_prompt_option: "AUTO",
    },
  };

  if (debug || process.env.NODE_ENV !== "production") {
    console.log("[WHITEBOARD_IMAGE_IDEOGRAM_REQUEST]", { ...requestBody.image_request, promptChars: requestBody.image_request.prompt.length });
  }

  const resp = await fetch("https://api.ideogram.ai/generate", {
    method: "POST",
    headers: {
      "Api-Key": process.env.IDEOGRAM_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const raw = await resp.text();

  if (debug || process.env.NODE_ENV !== "production") {
    console.log("[WHITEBOARD_IMAGE_IDEOGRAM_RESPONSE]", { status: resp.status, ok: resp.ok, rawChars: raw.length });
  }

  if (!resp.ok) throw Object.assign(new Error("Ideogram request failed"), { httpStatus: resp.status, raw });
  const data = JSON.parse(raw);
  const imageUrl = data?.data?.[0]?.url;
  if (!imageUrl) throw Object.assign(new Error("Ideogram response missing image URL"), { httpStatus: resp.status, raw });
  return { imageUrl, raw: raw.slice(0, 4000), status: resp.status };
}

/** Endpoints the server operator has explicitly configured. The client may only
 *  *select* among these (e.g. to pick the fine-tuned endpoint) — it can never
 *  supply an arbitrary URL, which would let any caller make this server issue
 *  requests to attacker-controlled or internal hosts (SSRF). */
const ALLOWED_SDXL_ENDPOINTS = new Set(
  [process.env.SDXL_API_ENDPOINT, process.env.SDXL_FINE_TUNED_ENDPOINT, ...(process.env.SDXL_ALLOWED_ENDPOINTS || "").split(",")]
    .map((s) => (s || "").trim())
    .filter(Boolean)
);

function resolveSdxlEndpoint(provider: "sdxl" | "sdxlFineTuned", opts: SdxlOptions): string {
  const defaultEndpoint = provider === "sdxlFineTuned"
    ? (process.env.SDXL_FINE_TUNED_ENDPOINT || process.env.SDXL_API_ENDPOINT || "")
    : (process.env.SDXL_API_ENDPOINT || "");
  const requested = (opts.endpoint || "").trim();
  if (requested && ALLOWED_SDXL_ENDPOINTS.has(requested)) return requested;
  return defaultEndpoint;
}

/** Stable Diffusion XL (custom endpoint) — also used for the fine-tuned
 *  ("sdxlFineTuned") provider, which just points `modelId` at a fine-tuned
 *  checkpoint instead of the base SDXL model. Architecture is ready for an
 *  eventual Armando H-style fine-tune; no real endpoint is required to exist
 *  yet — missing config fails the same friendly way as Ideogram's missing key. */
async function generateWithSDXL(
  prompt: string,
  provider: "sdxl" | "sdxlFineTuned",
  opts: SdxlOptions,
  debug: boolean,
): Promise<{ imageUrl: string; raw: string; status: number }> {
  const endpoint = resolveSdxlEndpoint(provider, opts);
  const modelId = opts.modelId
    || (provider === "sdxlFineTuned" ? process.env.SDXL_FINE_TUNED_MODEL_ID : process.env.SDXL_MODEL_ID)
    || undefined;
  const negativePrompt = [opts.negativePrompt, NEGATIVE_STYLE_HINT].filter(Boolean).join(", ");

  const requestBody = {
    prompt: prompt.slice(0, 4000),
    negative_prompt: negativePrompt,
    style_preset: opts.stylePreset || undefined,
    seed: typeof opts.seed === "number" ? opts.seed : undefined,
    model: modelId,
  };

  if (debug || process.env.NODE_ENV !== "production") {
    console.log("[WHITEBOARD_IMAGE_SDXL_REQUEST]", { provider, endpoint, modelId, promptChars: requestBody.prompt.length });
  }

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SDXL_API_KEY ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const raw = await resp.text();

  if (debug || process.env.NODE_ENV !== "production") {
    console.log("[WHITEBOARD_IMAGE_SDXL_RESPONSE]", { status: resp.status, ok: resp.ok, rawChars: raw.length });
  }

  if (!resp.ok) throw Object.assign(new Error("SDXL request failed"), { httpStatus: resp.status, raw });
  const data = JSON.parse(raw);
  const imageUrl = data?.imageUrl || data?.data?.[0]?.url || (data?.image_b64 ? `data:image/png;base64,${data.image_b64}` : undefined);
  if (!imageUrl) throw Object.assign(new Error("SDXL response missing image URL"), { httpStatus: resp.status, raw });
  return { imageUrl, raw: raw.slice(0, 4000), status: resp.status };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = (req.body || {}) as Body;
  const concept = (body.concept || "").trim();
  const context = (body.context || "").trim();
  const VALID_PROVIDERS: Provider[] = ["openai", "ideogram", "sdxl", "sdxlFineTuned"];
  const provider: Provider = VALID_PROVIDERS.includes(body.provider as Provider) ? (body.provider as Provider) : "openai";
  const sdxlOptions: SdxlOptions = body.sdxlOptions ?? {};
  const debug = Boolean(body.debug);

  if (!concept) {
    return res.status(400).json({ error: "Missing 'concept'." });
  }

  if (!HAS_OPENAI_KEY) {
    const failureReason = "OPENAI_API_KEY missing — cannot build the visual teaching script (Phase 1).";
    console.error("[WHITEBOARD_IMAGE_FAILURE]", { failureReason });
    return res.status(debug ? 200 : 500).json(
      debug
        ? { error: failureReason, aiDisabled: true, debugInfo: { failureReason } }
        : { error: failureReason, aiDisabled: true }
    );
  }

  if (provider === "ideogram" && !process.env.IDEOGRAM_API_KEY) {
    const failureReason = "IDEOGRAM_API_KEY not configured — Ideogram provider is not yet enabled.";
    console.warn("[WHITEBOARD_IMAGE_FAILURE]", { failureReason, provider });
    return res.status(debug ? 200 : 501).json(
      debug
        ? { error: failureReason, aiDisabled: true, debugInfo: { failureReason, model: modelLabelForProvider(provider) } }
        : { error: failureReason, aiDisabled: true }
    );
  }

  if ((provider === "sdxl" || provider === "sdxlFineTuned") && !resolveSdxlEndpoint(provider, sdxlOptions)) {
    const failureReason = `SDXL endpoint not configured — ${provider === "sdxlFineTuned" ? "fine-tuned SDXL" : "SDXL"} provider is not yet enabled.`;
    console.warn("[WHITEBOARD_IMAGE_FAILURE]", { failureReason, provider });
    return res.status(debug ? 200 : 501).json(
      debug
        ? { error: failureReason, aiDisabled: true, debugInfo: { failureReason, model: modelLabelForProvider(provider) } }
        : { error: failureReason, aiDisabled: true }
    );
  }

  let script = "";
  let directorRaw = "";
  try {
    const directed = await buildTeachingScript(concept, context, debug, body.visualPlan);
    script = directed.script;
    directorRaw = directed.raw;
    if (!script) throw new Error("Empty teaching script returned by gpt-4o-mini");
  } catch (err: any) {
    const failureReason = `Phase 1 (visual teaching script) failed: ${err?.message ?? String(err)}`;
    console.error("[WHITEBOARD_IMAGE_FAILURE]", { failureReason, provider });
    return res.status(debug ? 200 : 500).json(
      debug
        ? {
            error: failureReason,
            aiDisabled: true,
            debugInfo: {
              failureReason,
              model: "gpt-4o-mini",
              promptSent: { system: DIRECTOR_SYSTEM_PROMPT, user: `${concept}\n\n${context}`.slice(0, 2000) },
              rawResponse: directorRaw || String(err),
            },
          }
        : { error: failureReason, aiDisabled: true }
    );
  }

  const prompt = imagePromptFromScript(script, concept, body.diagramPlan);

  try {
    const drawn = provider === "ideogram"
      ? await generateWithIdeogram(prompt, debug)
      : provider === "sdxl" || provider === "sdxlFineTuned"
      ? await generateWithSDXL(prompt, provider, sdxlOptions, debug)
      : await generateWithOpenAI(prompt, debug);

    console.log("[WHITEBOARD_IMAGE_READY]", { provider, concept: concept.slice(0, 80), scriptChars: script.length });
    return res.status(200).json({ imageUrl: drawn.imageUrl, teachingScript: script, provider });
  } catch (err: any) {
    const failureReason = `Phase 2 (${provider} image generation) failed: ${err?.message ?? String(err)}`;
    console.error("[WHITEBOARD_IMAGE_FAILURE]", { failureReason, provider, httpStatus: err?.httpStatus });
    return res.status(debug ? 200 : 502).json(
      debug
        ? {
            error: failureReason,
            aiDisabled: true,
            debugInfo: {
              failureReason,
              model: modelLabelForProvider(provider),
              promptSent: { system: DIRECTOR_SYSTEM_PROMPT, user: prompt.slice(0, 2000) },
              rawResponse: err?.raw ?? String(err),
              httpStatus: err?.httpStatus,
            },
          }
        : { error: failureReason, aiDisabled: true }
    );
  }
}
