// pages/api/explainStep.ts
// "Explain This Step" — a contextual chatbox grounded in the current reader page.
//
// The student selects text/equation/step in the LeftPanel and opens a chat.
// Every turn is answered using the selected text, the current page text, the
// surrounding paragraph/thought unit, and the RightPanel study notes already
// generated for this page. Optional web enrichment is used only to add
// outside context on top of (never instead of) the book content.
//
// Provider order: OpenAI (primary) -> Anthropic Claude (fallback if no OpenAI key).

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { ExplainStepMessage, ExplainStepStudyNotes } from "@/lib/explainStep/types";

export const config = {
  maxDuration: 30,
  api: { bodyParser: { sizeLimit: "512kb" } },
};

export interface ExplainStepRequest {
  /** The exact text/equation/step the student selected in the LeftPanel */
  selectedText: string;
  /** Full text of the current page */
  pageText?: string;
  /** The surrounding paragraph / thought unit containing the selection */
  surroundingParagraph?: string;
  /** RightPanel page thesis for this page */
  pageThesis?: string | null;
  /** RightPanel study notes for this page */
  studyNotes?: ExplainStepStudyNotes | null;
  /** Concept block titles already identified for this page */
  conceptTitles?: string[];
  documentTitle?: string;
  pageNumber?: number;
  /** Full conversation so far (excluding system prompt) */
  messages: ExplainStepMessage[];
  /** Allow web enrichment when book/page context is insufficient */
  useWebSearch?: boolean;
}

export interface ExplainStepResponse {
  reply: string;
  provider: "openai" | "anthropic";
  usedWebSearch: boolean;
  error?: string;
}

function buildSystemPrompt(body: ExplainStepRequest): string {
  const notes = body.studyNotes;
  const noteLines = notes
    ? [
        notes.whyThisMatters && `Why this matters: ${notes.whyThisMatters}`,
        notes.keyMechanism && `Key mechanism: ${notes.keyMechanism}`,
        notes.commonConfusion && `Common confusion: ${notes.commonConfusion}`,
        notes.quickMemory && `Quick memory: ${notes.quickMemory}`,
        notes.reasoningFlow && `Reasoning flow: ${notes.reasoningFlow}`,
        notes.examSignal && `Exam signal: ${notes.examSignal}`,
      ].filter(Boolean).join("\n")
    : "";

  return `You are "Explain This Step" — a tutor embedded inside a PDF reader.

A student selected a specific piece of text, equation, or step on the page below and wants it explained clearly and simply. Stay grounded in the book's page content first. You may add outside (web) context only to enrich the explanation, never to replace or contradict the page content.

DOCUMENT: ${body.documentTitle ?? "(unknown)"}
PAGE: ${body.pageNumber ?? "unknown"}
PAGE THESIS: ${body.pageThesis ?? "(none)"}
${noteLines ? `\nRIGHT PANEL NOTES:\n${noteLines}\n` : ""}
${body.conceptTitles?.length ? `\nCONCEPT BLOCKS ON THIS PAGE: ${body.conceptTitles.join(", ")}\n` : ""}
SELECTED TEXT / STEP:
"""
${body.selectedText}
"""

SURROUNDING PARAGRAPH / THOUGHT UNIT:
"""
${(body.surroundingParagraph || "").slice(0, 1500)}
"""

CURRENT PAGE TEXT (for additional grounding):
"""
${(body.pageText || "").slice(0, 3000)}
"""

Rules:
- Explain the SELECTED step concretely, referencing the actual numbers/terms/words in it. Never give a generic definition when a worked calculation is selected — walk through how the numbers were derived.
- Keep answers short, clear, and conversational — a few sentences, not an essay.
- If the student asks a follow-up ("explain simpler", "give me an example", "make a recall card from this"), respond directly to that request using the same grounded context.
- Never mention "OpenAI", "Claude", "the study tool", or internal system names.
- ${body.useWebSearch ? "If the book context above is not enough to fully answer, you may use web search to add outside context — but always anchor your answer back to the selected page content first." : "Do not use outside/web sources — answer using only the page content and notes above."}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ExplainStepResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ reply: "", provider: "openai", usedWebSearch: false, error: "Method Not Allowed" });
  }

  const body = req.body as ExplainStepRequest;
  if (!body?.selectedText || !Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ reply: "", provider: "openai", usedWebSearch: false, error: "selectedText and messages are required" });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const systemPrompt = buildSystemPrompt(body);
  const useWebSearch = Boolean(body.useWebSearch);

  if (openaiKey) {
    try {
      const openai = new OpenAI({ apiKey: openaiKey });
      const model = useWebSearch ? "gpt-4o-search-preview" : "gpt-4o-mini";

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...body.messages.map((m) => ({ role: m.role, content: m.content }) as OpenAI.Chat.ChatCompletionMessageParam),
      ];

      const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = useWebSearch
        ? { model, messages, web_search_options: {} }
        : { model, messages, temperature: 0.3, max_tokens: 500 };

      const completion = await openai.chat.completions.create(params);
      const reply = completion.choices[0]?.message?.content?.trim() || "";

      if (reply) {
        console.log("[EXPLAIN_STEP_DONE]", {
          page: body.pageNumber ?? null,
          provider: "openai",
          model,
          usedWebSearch: useWebSearch,
          replyPreview: reply.slice(0, 100),
        });
        return res.status(200).json({ reply, provider: "openai", usedWebSearch: useWebSearch });
      }
    } catch (err: any) {
      console.error("[EXPLAIN_STEP_OPENAI_ERROR]", err?.message ?? String(err));
      // fall through to Anthropic
    }
  }

  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey });
      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        system: systemPrompt,
        messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
      });
      const reply = message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
      console.log("[EXPLAIN_STEP_DONE]", {
        page: body.pageNumber ?? null,
        provider: "anthropic",
        usedWebSearch: false,
        replyPreview: reply.slice(0, 100),
      });
      return res.status(200).json({ reply, provider: "anthropic", usedWebSearch: false });
    } catch (err: any) {
      console.error("[EXPLAIN_STEP_ANTHROPIC_ERROR]", err?.message ?? String(err));
      return res.status(502).json({ reply: "", provider: "anthropic", usedWebSearch: false, error: "Explanation provider failed" });
    }
  }

  return res.status(503).json({ reply: "", provider: "openai", usedWebSearch: false, error: "No explanation provider configured" });
}
