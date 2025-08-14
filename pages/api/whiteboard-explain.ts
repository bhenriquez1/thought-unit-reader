// pages/api/whiteboard-explain.ts
import type { NextApiRequest, NextApiResponse } from "next";

type Step = { title: string; content: string };
type Ok = { steps: Step[]; narrationScript: string; aiDisabled?: boolean };
type Err = { error: string; aiDisabled?: boolean };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Err>) {
  try {
    const { concept, context } = req.body || {};
    if (!concept || !context) return res.status(400).json({ error: "Missing concept/context" });

    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) {
      const fb = fallbackExplain(concept, context);
      return res.status(200).json({ ...fb, aiDisabled: true });
    }

    const prompt = makeWBPrompt(concept, context);
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    });

    if (!resp.ok) {
      const fb = fallbackExplain(concept, context);
      return res.status(200).json({ ...fb, aiDisabled: true });
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content?.trim() || "";
    // Expect a simple markdown-ish: split into 3–5 steps by headings/bullets.
    const parsed = parseToSteps(content);
    const nonEmpty = parsed.length ? parsed : fallbackExplain(concept, context).steps;

    return res.status(200).json({
      steps: nonEmpty,
      narrationScript: content || nonEmpty.map((s) => `${s.title}: ${s.content}`).join("\n"),
    });
  } catch {
    const fb = fallbackExplain(String(req.body?.concept || ""), String(req.body?.context || ""));
    return res.status(200).json({ ...fb, aiDisabled: true });
  }
}

function makeWBPrompt(concept: string, context: string) {
  return `Explain the following concept for a visual whiteboard lesson.
Context: ${context}
Concept: """${concept}"""

Output as short sections (3–5), each with a title and 1–2 sentence explanation.
Avoid fluff; keep it teachable and visual-friendly.`;
}

function parseToSteps(raw: string): { title: string; content: string }[] {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const steps: { title: string; content: string }[] = [];
  let cur: { title: string; content: string } | null = null;

  for (const line of lines) {
    const isHeader = /^#{1,3}\s+/.test(line) || /^[-*]\s+/.test(line);
    if (isHeader) {
      if (cur) steps.push(cur);
      cur = { title: line.replace(/^#{1,3}\s+|^[-*]\s+/, ""), content: "" };
    } else if (cur) {
      cur.content += (cur.content ? " " : "") + line;
    }
  }
  if (cur) steps.push(cur);
  return steps.slice(0, 6);
}

function fallbackExplain(concept: string, context: string) {
  const base = (s: string) => s.trim().slice(0, 180) + (s.length > 180 ? "…" : "");
  const c = concept || "Concept";
  const x = context || "This chapter";

  const steps = [
    { title: "Big Picture", content: `${x}: what this is and why it matters.` },
    { title: "Core Idea", content: base(c) },
    { title: "How to Visualize", content: "Sketch a simple diagram with 2–4 labeled parts." },
    { title: "Common Pitfall", content: "One frequent misconception and how to avoid it." },
    { title: "Clinically/Practically", content: "How this shows up in real tasks/questions." },
  ];
  return { steps, narrationScript: steps.map((s) => `${s.title}: ${s.content}`).join("\n") };
}