// pages/api/whiteboard-explain.ts
import type { NextApiRequest, NextApiResponse } from "next";

type Step = { title: string; content: string };
type Ok = { steps: Step[]; narrationScript: string; aiDisabled?: boolean };
type Err = { error: string; aiDisabled?: boolean };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | Err>
) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = (req.body || {}) as { concept?: string; context?: string };
    // Allow quick testing via query too: /api/whiteboard-explain?concept=...&context=...
    const concept = (body.concept ?? String(req.query.concept || "")).trim();
    const context = (body.context ?? String(req.query.context || "")).trim();

    if (!concept || !context) {
      return res.status(400).json({ error: "Missing concept/context" });
    }

    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) {
      const fb = fallbackExplain(concept, context);
      return res.status(200).json({ ...fb, aiDisabled: true });
    }

    const system = [
      "You are a medical/dental ‘Ninja Nerd’-style teacher producing a",
      "short whiteboard plan. Respond as strict JSON:",
      '{ "steps":[{ "title": string, "content": string }], "narrationScript": string }',
      "Keep 3–5 concise teaching steps; each ‘content’ is 1–2 sentences, visual-friendly.",
    ].join(" ");

    const user = `Context: ${context}\nConcept: """${concept}"""`;

    // Abort in case upstream hangs
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 30_000);

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      signal: ctrl.signal,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" }, // ask for JSON first
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    }).finally(() => clearTimeout(to));

    if (!resp.ok) {
      const fb = fallbackExplain(concept, context);
      return res.status(200).json({ ...fb, aiDisabled: true });
    }

    const data = await resp.json();
    const rawContent = data?.choices?.[0]?.message?.content?.trim() ?? "";

    // Try JSON first
    let steps: Step[] | null = null;
    let narrationScript = "";

    try {
      const j = JSON.parse(rawContent || "{}");
      const arr = Array.isArray(j.steps) ? j.steps : [];
      steps = arr
        .map((s: any) => ({
          title: String(s?.title ?? "").trim(),
          content: String(s?.content ?? s?.description ?? "").trim(),
        }))
        .filter((s: Step) => s.title || s.content)
        .slice(0, 6);
      narrationScript = String(j.narrationScript ?? "");
    } catch {
      // Not JSON → parse markdown-ish text
      steps = parseToSteps(rawContent);
      narrationScript = rawContent;
    }

    if (!steps || steps.length === 0) {
      const fb = fallbackExplain(concept, context);
      return res.status(200).json({ ...fb, aiDisabled: true });
    }

    if (!narrationScript) {
      narrationScript = steps.map((s) => `${s.title}: ${s.content}`).join("\n");
    }

    return res.status(200).json({ steps, narrationScript });
  } catch {
    const fb = fallbackExplain(
      String(req.body?.concept || req.query?.concept || ""),
      String(req.body?.context || req.query?.context || "")
    );
    return res.status(200).json({ ...fb, aiDisabled: true });
  }
}

/* ---------------- helpers ---------------- */

function parseToSteps(raw: string): Step[] {
  if (!raw?.trim()) return [];
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const steps: Step[] = [];
  let cur: Step | null = null;

  for (const line of lines) {
    const isHeader = /^#{1,3}\s+/.test(line) || /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line);
    if (isHeader) {
      if (cur) steps.push(cur);
      cur = { title: line.replace(/^#{1,3}\s+|^[-*]\s+|^\d+\.\s+/, ""), content: "" };
    } else if (cur) {
      cur.content += (cur.content ? " " : "") + line;
    }
  }
  if (cur) steps.push(cur);
  // Normalize + trim, keep 3–6
  return steps
    .map((s) => ({ title: s.title.trim(), content: s.content.trim() }))
    .filter((s) => s.title || s.content)
    .slice(0, 6);
}

function fallbackExplain(concept: string, context: string) {
  const base = (s: string) => (s || "").trim().slice(0, 180) + ((s || "").length > 180 ? "…" : "");
  const c = concept || "Concept";
  const x = context || "This chapter";

  const steps: Step[] = [
    { title: "Big Picture", content: `${x}: what this is and why it matters.` },
    { title: "Core Idea", content: base(c) },
    { title: "How to Visualize", content: "Sketch a simple diagram with 2–4 labeled parts." },
    { title: "Common Pitfall", content: "One frequent misconception and how to avoid it." },
    { title: "Clinically/Practically", content: "Where this shows up in real tasks/questions." },
  ];

  return {
    steps,
    narrationScript: steps.map((s) => `${s.title}: ${s.content}`).join("\n"),
  };
}