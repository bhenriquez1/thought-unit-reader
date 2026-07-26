// pages/api/podcast-script.ts
// Server-side endpoint: receives podcast context + mode, calls OpenAI to
// generate a structured podcast script, returns PodcastScript JSON.
// NEVER put the OpenAI API key in client-side code.

const DEV = process.env.NODE_ENV === "development";

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { buildPodcastPrompt, parsePodcastResponse, buildLocalPodcastScript } from "@/lib/podcast/podcastEngine";
import type { PodcastBuildContext } from "@/lib/podcast/podcastEngine";
import type { PodcastMode, PodcastScript } from "@/lib/podcast/podcastTypes";
import { MODE_THEMES } from "@/lib/podcast/podcastTypes";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type Body = {
  context: PodcastBuildContext;
  mode: PodcastMode;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PodcastScript | { error: string }>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { context, mode } = (req.body ?? {}) as Body;
  if (!context || !mode) {
    return res.status(400).json({ error: "Missing context or mode" });
  }

  DEV && console.log("[PODCAST_SOURCE]", {
    page:            context.pageNumber,
    bookId:          context.bookId,
    mode,
    pageTextChars:   context.pageText?.length ?? 0,
    visualAnchors:   context.studyModel?.visualAnchors?.length ?? 0,
    noteLabNotes:    context.noteLab?.length ?? 0,
    recallLabSets:   context.recallLab?.length ?? 0,
    hasRightPanel:   !!context.studyModel?.pageThesis,
  });

  DEV && console.log("[PODCAST_PAGE_CONTEXT]", {
    page:       context.pageNumber,
    pageThesis: context.studyModel?.pageThesis?.slice(0, 80) ?? null,
    textChars:  context.pageText?.length ?? 0,
  });

  DEV && console.log("[PODCAST_RIGHT_PANEL_CONTEXT]", {
    page:               context.pageNumber,
    hasWhyThisMatters:  !!context.studyModel?.studyNotes?.whyThisMatters,
    hasKeyMechanism:    !!context.studyModel?.studyNotes?.keyMechanism,
    hasCommonConfusion: !!context.studyModel?.studyNotes?.commonConfusion,
    hasQuickMemory:     !!context.studyModel?.studyNotes?.quickMemory,
    conceptBlocks:      context.studyModel?.conceptBlocks?.length ?? 0,
    visualAnchors:      context.studyModel?.visualAnchors?.length ?? 0,
  });

  DEV && console.log("[PODCAST_HIGHLIGHT_EVIDENCE]", {
    page:    context.pageNumber,
    count:   context.studyModel?.visualAnchors?.length ?? 0,
    anchors: context.studyModel?.visualAnchors?.slice(0, 5).map((a) => ({
      id: a.id, sourceField: a.sourceField, text: a.exactText.slice(0, 60),
    })) ?? [],
  });

  if (context.noteLab?.length > 0) {
    DEV && console.log("[PODCAST_NOTELAB_CONTEXT]", {
      page:         context.pageNumber,
      notes:        context.noteLab.length,
      sectionCount: context.noteLab.reduce((n, note) => n + (note.sections?.length ?? 0), 0),
      topics:       context.noteLab.map((n) => n.topic?.slice(0, 40)),
    });
  }

  if (context.recallLab?.length > 0) {
    DEV && console.log("[PODCAST_RECALL_BREAK]", {
      page:      context.pageNumber,
      sets:      context.recallLab.length,
      cardCount: context.recallLab.reduce((n, r) => n + r.cards.length, 0),
    });
  }

  const hasKey =
    process.env.OPENAI_API_KEY &&
    process.env.OPENAI_API_KEY.startsWith("sk-") &&
    process.env.OPENAI_API_KEY.length > 20;

  if (!hasKey) {
    DEV && console.log("[PODCAST_SCRIPT_CREATED]", {
      page: context.pageNumber, mode, source: "local-fallback", reason: "no-openai-key",
    });
    return res.status(200).json(buildLocalPodcastScript(context, mode));
  }

  try {
    const theme = MODE_THEMES[mode];
    const userPrompt = buildPodcastPrompt(context, mode);

    DEV && console.log("[PODCAST_MODE_STYLE]", {
      page:      context.pageNumber,
      mode,
      badge:     theme.badge,
      hostName:  theme.hostName,
      hostRole:  theme.hostRole,
      guestName: theme.guestName,
      guestRole: theme.guestRole,
    });

    DEV && console.log("[PODCAST_EXTERNAL_VERIFY]", {
      page:   context.pageNumber,
      mode,
      note:   "External verification segments cite trusted sources by name for clinical/cross-reference modes.",
    });

    const systemPrompt = [
      `You are an award-winning educational podcast producer writing REALISTIC, natural-sounding academic dialogue.`,
      `This episode uses the "${theme.badge}" format with two named speakers:`,
      `  - ${theme.hostName} (${theme.hostRole}) → use speaker="host"`,
      `  - ${theme.guestName} (${theme.guestRole}) → use speaker="guest"`,
      ``,
      `CRITICAL RULES for realistic dialogue:`,
      `1. Keep each segment to 1–2 sentences max — short conversational turns, not lectures.`,
      `2. Use the speaker's NAME naturally in the text (e.g. "${theme.hostName}: Here's the thing..." or "${theme.guestName}: Wait—").`,
      `3. Use natural reactions to start turns: "Exactly.", "Right, so—", "Good catch.", "Hold on—", "That's the trap.", "And here's where it gets interesting:", "I want you to catch this:"`,
      `4. When referencing a highlight anchor, the speaker should quote or paraphrase the exact text.`,
      `5. Alternate speakers naturally — avoid 3+ consecutive segments from the same speaker.`,
      `6. NO bullet points, NO headers, NO markdown in the text field. Pure spoken natural language only.`,
      ``,
      `Always return valid JSON only — no explanation outside the JSON object.`,
      `Format: { "segments": [ { "id": "seg-0", "type": "intro", "speaker": "host", "text": "..." }, ... ] }`,
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model:       "gpt-4o-mini",
      temperature: 0.65,
      max_tokens:  2000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    const script = parsePodcastResponse(raw, context, mode);

    const turnSequence = script.segments.map((s, idx) => ({
      idx,
      speaker: s.speaker,
      type: s.type,
      chars: s.text.length,
      hasAnchor: !!s.anchorId,
    }));
    DEV && console.log("[PODCAST_TURN_SEQUENCE]", {
      page:         context.pageNumber,
      mode,
      totalTurns:   script.totalSegments,
      hostTurns:    script.segments.filter(s => s.speaker === "host").length,
      guestTurns:   script.segments.filter(s => s.speaker === "guest").length,
      anchorTurns:  script.segments.filter(s => !!s.anchorId).length,
      sequence:     turnSequence.slice(0, 8),
    });

    DEV && console.log("[PODCAST_SCRIPT_CREATED]", {
      page:      context.pageNumber,
      mode,
      source:    "openai",
      segments:  script.totalSegments,
      estimatedMinutes: script.estimatedMinutes,
      model:     "gpt-4o-mini",
    });

    return res.status(200).json(script);
  } catch (err: any) {
    DEV && console.error("[PODCAST_SCRIPT_ERROR]", { error: err?.message ?? String(err) });
    // Fall back to local deterministic script
    return res.status(200).json(buildLocalPodcastScript(context, mode));
  }
}
