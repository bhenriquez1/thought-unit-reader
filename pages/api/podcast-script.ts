// pages/api/podcast-script.ts
// Server-side endpoint: receives podcast context + mode, calls OpenAI to
// generate a structured podcast script, returns PodcastScript JSON.
// NEVER put the OpenAI API key in client-side code.

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import { buildPodcastPrompt, parsePodcastResponse, buildLocalPodcastScript } from "@/lib/podcast/podcastEngine";
import type { PodcastBuildContext } from "@/lib/podcast/podcastEngine";
import type { PodcastMode, PodcastScript } from "@/lib/podcast/podcastTypes";

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

  console.log("[PODCAST_SOURCE]", {
    page:            context.pageNumber,
    bookId:          context.bookId,
    mode,
    pageTextChars:   context.pageText?.length ?? 0,
    visualAnchors:   context.studyModel?.visualAnchors?.length ?? 0,
    noteLabNotes:    context.noteLab?.length ?? 0,
    recallLabSets:   context.recallLab?.length ?? 0,
    hasRightPanel:   !!context.studyModel?.pageThesis,
  });

  console.log("[PODCAST_PAGE_CONTEXT]", {
    page:       context.pageNumber,
    pageThesis: context.studyModel?.pageThesis?.slice(0, 80) ?? null,
    textChars:  context.pageText?.length ?? 0,
  });

  console.log("[PODCAST_RIGHT_PANEL_CONTEXT]", {
    page:               context.pageNumber,
    hasWhyThisMatters:  !!context.studyModel?.studyNotes?.whyThisMatters,
    hasKeyMechanism:    !!context.studyModel?.studyNotes?.keyMechanism,
    hasCommonConfusion: !!context.studyModel?.studyNotes?.commonConfusion,
    hasQuickMemory:     !!context.studyModel?.studyNotes?.quickMemory,
    conceptBlocks:      context.studyModel?.conceptBlocks?.length ?? 0,
    visualAnchors:      context.studyModel?.visualAnchors?.length ?? 0,
  });

  console.log("[PODCAST_HIGHLIGHT_EVIDENCE]", {
    page:    context.pageNumber,
    count:   context.studyModel?.visualAnchors?.length ?? 0,
    anchors: context.studyModel?.visualAnchors?.slice(0, 5).map((a) => ({
      id: a.id, sourceField: a.sourceField, text: a.exactText.slice(0, 60),
    })) ?? [],
  });

  if (context.noteLab?.length > 0) {
    console.log("[PODCAST_NOTELAB_CONTEXT]", {
      page:         context.pageNumber,
      notes:        context.noteLab.length,
      sectionCount: context.noteLab.reduce((n, note) => n + (note.sections?.length ?? 0), 0),
      topics:       context.noteLab.map((n) => n.topic?.slice(0, 40)),
    });
  }

  if (context.recallLab?.length > 0) {
    console.log("[PODCAST_RECALL_BREAK]", {
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
    console.log("[PODCAST_SCRIPT_CREATED]", {
      page: context.pageNumber, mode, source: "local-fallback", reason: "no-openai-key",
    });
    return res.status(200).json(buildLocalPodcastScript(context, mode));
  }

  try {
    const userPrompt = buildPodcastPrompt(context, mode);

    console.log("[PODCAST_EXTERNAL_VERIFY]", {
      page:   context.pageNumber,
      mode,
      note:   "External verification segments will cite trusted sources by name if mode includes clinical or cross-reference context.",
    });

    const completion = await openai.chat.completions.create({
      model:       "gpt-4o-mini",
      temperature: 0.55,
      max_tokens:  1800,
      messages: [
        {
          role: "system",
          content:
            "You are an expert academic podcast writer. You generate conversational, educational podcast scripts from study materials. " +
            "Always return valid JSON only — no markdown, no explanation outside the JSON object. " +
            'Format: { "segments": [ { "id": "seg-0", "type": "intro", "speaker": "host", "text": "..." }, ... ] }',
        },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    const script = parsePodcastResponse(raw, context, mode);

    console.log("[PODCAST_SCRIPT_CREATED]", {
      page:      context.pageNumber,
      mode,
      source:    "openai",
      segments:  script.totalSegments,
      estimatedMinutes: script.estimatedMinutes,
      model:     "gpt-4o-mini",
    });

    return res.status(200).json(script);
  } catch (err: any) {
    console.error("[PODCAST_SCRIPT_ERROR]", { error: err?.message ?? String(err) });
    // Fall back to local deterministic script
    return res.status(200).json(buildLocalPodcastScript(context, mode));
  }
}
