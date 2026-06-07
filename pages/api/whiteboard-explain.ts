// pages/api/whiteboard-explain.ts
// Universal visual teaching engine — subject-agnostic.
// Visualizes ONLY what is already in the study model (no independent concept invention).
import type { NextApiRequest, NextApiResponse } from "next";

/* ─── Types ─────────────────────────────────────────────────────────────── */

type StepPayload = {
  text?: string;
  prompt?: string;
  caption?: string;
  anchorId?: string | null;
  sourceField?: string | null;
};

type DiagramNode = { id: string; label: string; nx?: number; ny?: number };
type DiagramArrow = { from: string; to: string; label?: string };

type Step = {
  title: string;
  content: string;
  type?: "text" | "draw" | "erase" | "image";
  drawType?: "flow" | "anatomy" | "comparison" | "table" | "graph" | "equation" | "timeline" | "cycle";
  nodes?: DiagramNode[];
  arrows?: DiagramArrow[];
  payload?: StepPayload;
  objects?: string[];
};

type Ok  = { steps: Step[]; narrationScript: string; aiDisabled?: boolean };
type Err = { error: string; aiDisabled?: boolean };

/* ─── Whiteboard mode derivation ────────────────────────────────────────────── */

type WhiteboardMode =
  | "anatomyClinical"   // medicine, dentistry, anatomy, pharmacology
  | "biologyPathway"    // biology, physiology, genetics, biochem pathways
  | "chemistryReaction" // chemistry, molecular/ionic reactions
  | "mathGraph"         // calculus, algebra, statistics, discrete math
  | "physicsSystem"     // physics — forces, circuits, waves
  | "historyTimeline"   // history, social science, political science
  | "businessFramework" // business, finance, marketing, economics
  | "textArgument"      // literature, philosophy, rhetoric, reading
  | "genericTutor";     // fallback

function deriveWhiteboardMode(text: string): WhiteboardMode {
  const t = text.toLowerCase();
  // Dentistry/clinical (test before medicine — more specific terms)
  if (/\b(molar|tooth|teeth|periodon|pulp|enamel|dentin|gingiv|caries|occlus|endodon|orthodon|implant|crown|root canal|periodont)\b/.test(t)) return "anatomyClinical";
  // Medicine/anatomy/pharmacology
  if (/\b(diagnosis|symptom|treatment|pathology|clinical|patient|disease|disorder|syndrome|anatomy|histology|pharmacol|drug|dose|mechanism of action|receptor|signaling)\b/.test(t)) return "anatomyClinical";
  // Biology/physiology/genetics
  if (/\b(cell|protein|dna|rna|gene|enzyme|atp|mitosis|meiosis|membrane|neuron|synapse|hormone|bacteria|virus|pathway|krebs|glycolysis|metabolism|genetics|chromosome|ecosystem)\b/.test(t)) return "biologyPathway";
  // Chemistry
  if (/\b(molecule|atom|bond|reaction|element|compound|oxidation|reduction|equilibrium|acid|base|pH|catalyst|entropy|enthalpy|orbital|electron|mole|stoichiometry|titration)\b/.test(t)) return "chemistryReaction";
  // Physics
  if (/\b(force|momentum|velocity|acceleration|gravity|electric field|magnetic|photon|circuit|torque|friction|wave|frequency|quantum|thermodynamics|optics)\b/.test(t)) return "physicsSystem";
  // Math (after physics since "energy" appears in both)
  if (/\b(integral|derivative|limit|series|sequence|convergence|divergence|matrix|theorem|proof|polynomial|calculus|algebra|trigonometry|probability|distribution|statistics|regression)\b/.test(t)) return "mathGraph";
  // History/social science
  if (/\b(century|war|empire|dynasty|revolution|treaty|civilization|colony|parliament|monarchy|republic|election|movement|social|political)\b/.test(t)) return "historyTimeline";
  // Business/finance
  if (/\b(market|revenue|profit|cost|strategy|management|supply|demand|price|competition|stakeholder|budget|invest|finance|economics|gdp|inflation)\b/.test(t)) return "businessFramework";
  // Literature/philosophy/reading
  if (/\b(theme|argument|thesis|evidence|narrative|character|symbol|metaphor|analysis|claim|rhetoric|philosophy|genre|setting|plot)\b/.test(t)) return "textArgument";
  return "genericTutor";
}

function modeDrawingStyle(mode: WhiteboardMode): string {
  const base = "Teach visually. Use simple hand-drawn-style diagrams, thick colored arrows, labels, and minimal text. Current page Study Model only. No legacy/fallback content.";
  switch (mode) {
    case "anatomyClinical":
      return base + " MODE: anatomyClinical. Draw body structures, teeth, tissues, or disease process. Use 'anatomy' drawType — central structure/organ as root oval, surround with labeled arrows to components (enamel, pulp, PDL, nerve, vessel) or disease process nodes (etiology→pathophysiology→clinical sign→treatment). Set nx/ny for organic radial placement. Use 'flow' for procedure or algorithm steps.";
    case "biologyPathway":
      return base + " MODE: biologyPathway. Draw pathways, cell processes, organ systems, or cause→effect chains. Use 'cycle' drawType for circular/repeating processes (Krebs, cell cycle, ATP synthesis). Use 'flow' for linear pathways (signal→receptor→response). Use 'anatomy' for organ/cell structure with labeled parts.";
    case "chemistryReaction":
      return base + " MODE: chemistryReaction. Draw reactions, bonds, and molecular transformations. Use 'flow' for reaction steps (reactant + reagent → product, label arrows with conditions: heat, catalyst, pH). Use 'graph' for energy diagrams (y=energy, x=reaction coordinate; plot reactants, TS, products). Use 'comparison' for reactants vs products or acid/base pairs.";
    case "mathGraph":
      return base + " MODE: mathGraph. Use 'graph' drawType with ≥5 nodes labeled 'x=N, y=V' (or 'n=N, a=V'). Include 'L=VALUE' node for limits. Use 'flow' for proof or derivation chains (equation → operation → simplified result). Use 'table' for definitions or properties.";
    case "physicsSystem":
      return base + " MODE: physicsSystem. Use 'anatomy' for force diagrams (central object as root, forces as surrounding nodes with magnitude labels). Use 'graph' for wave, field, or motion plots (y=quantity, x=time or position). Use 'flow' for derivation chains or circuit analysis steps.";
    case "historyTimeline":
      return base + " MODE: historyTimeline. Use 'timeline' drawType — nodes are events in chronological order, label = brief event + date. Arrow labels = 'causes', 'leads to', 'triggers'. Use 'comparison' for two-sides debates or before/after scenarios. Use 'flow' for cause→effect chains.";
    case "businessFramework":
      return base + " MODE: businessFramework. Use 'flow' for process chains or funnels (awareness→interest→decision→action). Use 'comparison' for cost/benefit, pros/cons, or two strategies. Use 'table' for frameworks (SWOT: S/W/O/T as alternating nodes). Use 'anatomy' for system maps with a central entity and stakeholder arrows.";
    case "textArgument":
      return base + " MODE: textArgument. Use 'anatomy' drawType — central thesis as root node, surrounding nodes are evidence/claims, outer nodes are implications. Use 'comparison' for two opposing interpretations or arguments. Use 'flow' for claim→evidence→warrant reasoning chains.";
    default:
      return base + " MODE: genericTutor. Use 'anatomy' for any concept with components, 'flow' for any process, 'comparison' for any contrast, 'graph' for any data or function.";
  }
}

/* ─── Model context builder ──────────────────────────────────────────────── */

function buildModelContext(studyModel: any): string {
  if (!studyModel || typeof studyModel !== "object") return "";
  const parts: string[] = [];
  if (studyModel.pageThesis)             parts.push(`PAGE THESIS: ${studyModel.pageThesis}`);
  if (studyModel.studyNotes) {
    const sn = studyModel.studyNotes;
    if (sn.whyThisMatters)  parts.push(`WHY IT MATTERS: ${sn.whyThisMatters}`);
    if (sn.keyMechanism)    parts.push(`KEY MECHANISM: ${sn.keyMechanism}`);
    if (sn.commonConfusion) parts.push(`COMMON CONFUSION: ${sn.commonConfusion}`);
  }
  if (Array.isArray(studyModel.conceptBlocks)) {
    studyModel.conceptBlocks.slice(0, 3).forEach((c: any, i: number) => {
      parts.push(`CONCEPT ${i + 1}: ${c.title ?? ""} — ${c.principle ?? c.mechanism ?? ""}`);
    });
  }
  if (Array.isArray(studyModel.visualAnchors)) {
    studyModel.visualAnchors.slice(0, 6).forEach((a: any) => {
      parts.push(`ANCHOR [${a.id ?? ""}] (${a.sourceField ?? ""}): "${a.exactText ?? a.text ?? ""}"`);
    });
  }
  return parts.join("\n");
}

/* ─── Fallback (no API key / API error) ─────────────────────────────────── */

function buildFallbackSteps(concept: string, context: string, studyModel: any): Step[] {
  const anchors: any[] = Array.isArray(studyModel?.visualAnchors) ? studyModel.visualAnchors : [];
  const firstAnchor    = anchors[0];

  const base = (s: string) => (s || "").trim().slice(0, 180) + ((s || "").length > 180 ? "…" : "");
  return [
    {
      title: "Big Picture",
      content: `${context || "This section"}: what this is and why it matters.`,
      type: "text",
      payload: { text: `${context || "This section"}: what this is and why it matters.` },
    },
    {
      title: "Core Idea",
      content: base(concept || studyModel?.pageThesis || "Core concept"),
      type: "text",
      payload: {
        text: base(concept || studyModel?.pageThesis || ""),
        anchorId: firstAnchor?.id ?? null,
        sourceField: firstAnchor?.sourceField ?? null,
      },
    },
    {
      title: "Visual Diagram",
      content: "Sketch a simple diagram with 2–4 labeled parts.",
      type: "draw",
      payload: {
        prompt: studyModel?.studyNotes?.keyMechanism
          ? `Diagram: ${studyModel.studyNotes.keyMechanism}`
          : "Simple labeled diagram with 2–4 parts.",
        anchorId: anchors[1]?.id ?? null,
        sourceField: anchors[1]?.sourceField ?? null,
      },
    },
    {
      title: "Key Mechanism",
      content: studyModel?.studyNotes?.keyMechanism || "How the core process works step by step.",
      type: "text",
      payload: {
        text: studyModel?.studyNotes?.keyMechanism || "How the core process works.",
        anchorId: anchors[2]?.id ?? null,
        sourceField: "keyMechanism",
      },
    },
    {
      title: "Common Confusion",
      content: studyModel?.studyNotes?.commonConfusion || "A frequent misconception and how to avoid it.",
      type: "text",
      payload: {
        text: studyModel?.studyNotes?.commonConfusion || "A frequent misconception and how to avoid it.",
        anchorId: anchors[3]?.id ?? null,
        sourceField: "commonConfusion",
      },
    },
  ];
}

/* ─── Handler ────────────────────────────────────────────────────────────── */

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | Err>
) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body       = (req.body || {}) as {
      concept?: string;
      context?: string;
      studyModel?: any;
      pageText?: string;
    };
    const concept    = (body.concept  ?? String(req.query.concept  || "")).trim();
    const context    = (body.context  ?? String(req.query.context  || "")).trim();
    const studyModel = body.studyModel ?? null;
    const pageText   = (body.pageText  ?? "").slice(0, 1200);

    if (!concept && !studyModel?.pageThesis) {
      return res.status(400).json({ error: "Missing concept/studyModel" });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error("[OPENAI_API_KEY_MISSING] Set OPENAI_API_KEY in .env.local");
    }
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) {
      const fb = buildFallbackSteps(concept, context, studyModel);
      return res.status(200).json({
        steps: fb,
        narrationScript: fb.map((s) => `${s.title}: ${s.content}`).join("\n"),
        aiDisabled: true,
      });
    }

    const allText   = [concept, context, pageText, studyModel?.pageThesis ?? ""].join(" ");
    const mode      = deriveWhiteboardMode(allText);
    const drawStyle = modeDrawingStyle(mode);
    const modelCtx  = buildModelContext(studyModel);

    const system = [
      "You are a visual teaching engine — you draw to teach, not write to explain.",
      "Avrrio style: colored-pencil educational board. Thick curved arrows, labeled structures, cause→effect. No generic text slides.",
      "Produce a whiteboard animation plan as strict JSON:",
      '{ "steps":[{',
      '  "title": string, "content": string,',
      '  "type": "text"|"draw"|"erase"|"image",',
      '  "drawType"?: "flow"|"anatomy"|"comparison"|"table"|"graph"|"timeline"|"cycle",',
      '  "nodes"?: [{"id": string, "label": string, "nx"?: number, "ny"?: number}],',
      '  "arrows"?: [{"from": string, "to": string, "label"?: string}],',
      '  "payload"?: {"text"?: string, "prompt"?: string, "anchorId"?: string|null, "sourceField"?: string|null}',
      '  "objects"?: string[] // one or more of: sketch, arrow, label, equation, graph, tooth, organ, pathway',
      '}], "visualDrawingPlan": {"title": string, "narration": string}, "narrationScript": string }',
      "Rules:",
      "- 3–5 steps. Each step draws ONE teaching idea — mechanism, relationship, or comparison.",
      "- DRAW, do not write paragraphs. Use type 'draw' with drawType + nodes/arrows for every step.",
      "- Do NOT invent concepts — only visualize what is in the study model below.",
      "- Mechanisms first: step 1 shows the core cause→effect or structure→function relationship.",
      "- " + drawStyle,
      "  anatomy: root node first; set nx/ny (0.0–1.0 fractions) for organic radial layout — NO straight horizontal lines.",
      "  flow: linear process chain — arrows connect sequential steps.",
      "  cycle: circular repeating process — nodes placed in a ring, arrows connect each step to next, last to first.",
      "  comparison: exactly 2 nodes (contrasted items).",
      "  table: alternating term/definition pairs.",
      "  graph: data points labeled 'x=N, y=V' (min 5). Add 'L=VALUE' for limits.",
      "  timeline: chronological events — node label = event + date. Arrows = causal relationship.",
      "- Arrow labels: 1–3 words max (e.g. 'causes', 'leads to', 'inhibits').",
      "- Set anchorId/sourceField to matching ANCHOR ID from model context if available; else null.",
      "- objects: list the visual object types used in this step (e.g. [\"sketch\",\"arrow\"] for anatomy, [\"equation\",\"graph\"] for math, [\"tooth\",\"label\"] for dental).",
      "- narrationScript: one fluent paragraph the teacher speaks while drawing — conversational, not formal.",
    ].join(" ");

    const user = [
      modelCtx ? `STUDY MODEL:\n${modelCtx}` : "",
      pageText  ? `PAGE TEXT (excerpt):\n${pageText.slice(0, 600)}` : "",
      `CONCEPT: """${concept || studyModel?.pageThesis || ""}"""`,
      context   ? `CONTEXT: ${context}` : "",
    ].filter(Boolean).join("\n\n");

    const ctrl = new AbortController();
    const to   = setTimeout(() => ctrl.abort(), 30_000);

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      signal: ctrl.signal,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Bearer ${key}`,
      },
      body: JSON.stringify({
        model:           "gpt-4o-mini",
        temperature:     0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user",   content: user },
        ],
      }),
    }).finally(() => clearTimeout(to));

    if (!resp.ok) {
      const fb = buildFallbackSteps(concept, context, studyModel);
      return res.status(200).json({
        steps: fb,
        narrationScript: fb.map((s) => `${s.title}: ${s.content}`).join("\n"),
        aiDisabled: true,
      });
    }

    const data       = await resp.json();
    const rawContent = data?.choices?.[0]?.message?.content?.trim() ?? "";

    let steps: Step[] | null = null;
    let narrationScript = "";

    try {
      const j   = JSON.parse(rawContent || "{}");
      const arr = Array.isArray(j.steps) ? j.steps : [];
      const VALID_DRAW_TYPES = ["flow", "anatomy", "comparison", "table", "graph", "equation", "timeline", "cycle"];
      steps = arr
        .map((s: any) => ({
          title:    String(s?.title   ?? "").trim(),
          content:  String(s?.content ?? s?.description ?? "").trim(),
          type:     (["text", "draw", "erase", "image"].includes(s?.type) ? s.type : "text") as Step["type"],
          drawType: VALID_DRAW_TYPES.includes(s?.drawType) ? s.drawType : undefined,
          nodes:    Array.isArray(s?.nodes) ? s.nodes : undefined,
          arrows:   Array.isArray(s?.arrows) ? s.arrows : undefined,
          payload:  s?.payload ?? {},
          objects:  Array.isArray(s?.objects) ? s.objects.map(String) : [],
        }))
        .filter((s: Step) => s.title || s.content)
        .slice(0, 6);
      narrationScript = String(j.narrationScript ?? "");
    } catch {
      steps = buildFallbackSteps(concept, context, studyModel);
      narrationScript = steps.map((s) => `${s.title}: ${s.content}`).join("\n");
    }

    if (!steps || steps.length === 0) {
      const fb = buildFallbackSteps(concept, context, studyModel);
      return res.status(200).json({
        steps: fb,
        narrationScript: fb.map((s) => `${s.title}: ${s.content}`).join("\n"),
        aiDisabled: true,
      });
    }

    if (!narrationScript) {
      narrationScript = steps.map((s) => `${s.title}: ${s.content}`).join("\n");
    }

    console.log("[WHITEBOARD_OPENAI_DIAGRAM]", { mode, stepCount: steps.length, hasNarration: !!narrationScript, hasObjects: steps[0]?.objects?.length ?? 0 });

    return res.status(200).json({ steps, narrationScript });

  } catch {
    const body    = (req.body || {}) as any;
    const concept = String(body?.concept  || req.query?.concept  || "");
    const context = String(body?.context  || req.query?.context  || "");
    const sm      = body?.studyModel ?? null;
    const fb      = buildFallbackSteps(concept, context, sm);
    return res.status(200).json({
      steps: fb,
      narrationScript: fb.map((s) => `${s.title}: ${s.content}`).join("\n"),
      aiDisabled: true,
    });
  }
}
