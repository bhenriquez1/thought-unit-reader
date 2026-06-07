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
  drawType?: "flow" | "anatomy" | "comparison" | "table" | "graph" | "equation" | "timeline";
  nodes?: DiagramNode[];
  arrows?: DiagramArrow[];
  payload?: StepPayload;
};

type Ok  = { steps: Step[]; narrationScript: string; aiDisabled?: boolean };
type Err = { error: string; aiDisabled?: boolean };

/* ─── Subject detection ──────────────────────────────────────────────────── */

type Subject =
  | "biology" | "chemistry" | "physics" | "mathematics"
  | "dentistry" | "medicine" | "law" | "cs" | "history" | "general";

function detectSubjectHint(text: string): Subject {
  const t = text.toLowerCase();
  if (/\b(cell|protein|dna|rna|gene|enzyme|atp|mitosis|meiosis|membrane|neuron|receptor|synapse|hormone|bacteria|virus|organ|tissue)\b/.test(t)) return "biology";
  if (/\b(molar|tooth|teeth|periodon|pulp|enamel|dentin|gingiv|caries|occlus|endodon|orthodon|implant|crown|root canal)\b/.test(t)) return "dentistry";
  if (/\b(diagnosis|symptom|treatment|pathology|clinical|patient|disease|disorder|syndrome|anatomy|physiology|pharmacology|drug|dose)\b/.test(t)) return "medicine";
  if (/\b(molecule|atom|bond|reaction|element|compound|oxidation|reduction|equilibrium|acid|base|pH|catalyst|entropy|enthalpy|orbital)\b/.test(t)) return "chemistry";
  if (/\b(force|energy|momentum|velocity|acceleration|mass|gravity|electric|magnetic|wave|frequency|quantum|photon|electron|circuit)\b/.test(t)) return "physics";
  if (/\b(integral|derivative|matrix|vector|theorem|proof|equation|polynomial|function|limit|convergence|probability|statistics)\b/.test(t)) return "mathematics";
  if (/\b(statute|law|court|constitution|jurisdiction|contract|tort|liability|plaintiff|defendant|precedent|holding|ruling)\b/.test(t)) return "law";
  if (/\b(algorithm|complexity|function|class|object|api|database|network|protocol|compiler|runtime|memory|thread|stack)\b/.test(t)) return "cs";
  if (/\b(century|war|empire|dynasty|revolution|treaty|civilization|colony|parliament|monarchy|republic|election|movement)\b/.test(t)) return "history";
  return "general";
}

function subjectDrawingStyle(subject: Subject): string {
  const base = "Draw like a teacher at a whiteboard — simple lines, colored arrows, labeled boxes. Mechanisms first. No text slides.";
  switch (subject) {
    case "biology":
      return base + " Biology: draw cell/organ diagrams with labeled arrows showing cause→effect pathways. Show molecule → reaction → product chains. Use flow diagrams for cycles (e.g. ATP synthesis, cell cycle). Colored arrows show direction of process.";
    case "dentistry":
      return base + " Dental: draw tooth cross-section diagrams (enamel/dentin/pulp/root layers) with labels and arrows. Show retention/support relationships with directional arrows. Draw procedure steps as numbered flow steps. Show before→after for clinical scenarios.";
    case "medicine":
      return base + " Medicine: draw symptom→mechanism→treatment flow trees. Show pathophysiology chains (pathogen → tissue damage → clinical sign). Draw anatomy cross-sections with labeled structures and arrow pointing to affected area. Use flow diagrams for diagnosis algorithms.";
    case "chemistry":
      return base + " Chemistry: draw reaction arrows showing electron flow, structural formula transformations, energy diagrams (reactants → transition state → products). Show orbital shapes where relevant.";
    case "physics":
      return base + " Physics: draw free-body diagrams with labeled force arrows, circuit schematics with component labels, wave forms with amplitude/period labeled, field lines with direction arrows.";
    case "mathematics":
      return base + " Math: draw coordinate axes with plotted sequence/function points. Show convergence by plotting terms approaching a limit line. Draw geometric proofs with labeled vertices. For each step of a derivation, show the transformation as a flow: equation → operation → result.";
    case "law":
      return base + " Law: draw rule→elements→analysis→conclusion flowcharts. Show how facts satisfy each element. Use comparison columns for competing arguments.";
    case "cs":
      return base + " CS: draw data structure diagrams (nodes, pointers, stacks), algorithm flowcharts with decision diamonds, or system architecture boxes with labeled arrows.";
    case "history":
      return base + " History: draw cause→effect chains with labeled arrows, timelines with key events, political/social hierarchy trees.";
    default:
      return base + " Use labeled boxes connected by arrows. Mechanisms first — show cause→effect. Add a comparison step if two things are contrasted.";
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
    const subject   = detectSubjectHint(allText);
    const drawStyle = subjectDrawingStyle(subject);
    const modelCtx  = buildModelContext(studyModel);

    const mathGraphInstructions = subject === "mathematics"
      ? ' For sequences/series/functions use drawType "graph" with ≥5 nodes whose labels are "x=N, y=V" (or "n=N, a=V") data points plus an optional "L=VALUE" node for the limit.'
      : "";

    const system = [
      "You are a visual teaching engine in the style of Armando Hasudungan — you draw to teach, not write to explain.",
      "Produce a whiteboard animation plan as strict JSON:",
      '{ "steps":[{',
      '  "title": string, "content": string,',
      '  "type": "text"|"draw"|"erase"|"image",',
      '  "drawType"?: "flow"|"anatomy"|"comparison"|"table"|"graph"|"equation"|"timeline",',
      '  "nodes"?: [{"id": string, "label": string, "nx"?: number, "ny"?: number}],',
      '  "arrows"?: [{"from": string, "to": string, "label"?: string}],',
      '  "payload"?: {"text"?: string, "prompt"?: string, "anchorId"?: string|null, "sourceField"?: string|null}',
      '}], "narrationScript": string }',
      "Rules:",
      "- 3–5 steps. Each step draws ONE teaching idea — mechanism, relationship, or comparison.",
      "- DRAW, do not write paragraphs. Use type 'draw' with drawType + nodes/arrows for every step that teaches a process or structure.",
      "- Do NOT invent concepts — only visualize what is in the study model below.",
      "- Mechanisms first: step 1 should always show the core cause→effect chain.",
      "- Drawing styles: " + drawStyle,
      "  flow/anatomy: nodes=process steps or anatomical parts, arrows=direction of process/signal.",
      "  comparison: exactly 2 nodes (what is contrasted). Use for misconception vs. reality.",
      "  table: alternating term/definition nodes. Use for vocabulary or classification.",
      "  graph: nodes are data points labeled 'x=N, y=V' (minimum 5 points). Include 'L=VALUE' node if there is a limit." + mathGraphInstructions,
      "- Set anchorId/sourceField to matching ANCHOR ID from model context if available; else null.",
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
      const VALID_DRAW_TYPES = ["flow", "anatomy", "comparison", "table", "graph", "equation", "timeline"];
      steps = arr
        .map((s: any) => ({
          title:    String(s?.title   ?? "").trim(),
          content:  String(s?.content ?? s?.description ?? "").trim(),
          type:     (["text", "draw", "erase", "image"].includes(s?.type) ? s.type : "text") as Step["type"],
          drawType: VALID_DRAW_TYPES.includes(s?.drawType) ? s.drawType : undefined,
          nodes:    Array.isArray(s?.nodes) ? s.nodes : undefined,
          arrows:   Array.isArray(s?.arrows) ? s.arrows : undefined,
          payload:  s?.payload ?? {},
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

    console.log("[WHITEBOARD_OPENAI_DIAGRAM]", { subject, stepCount: steps.length, hasNarration: !!narrationScript });

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
