// lib/podcast/podcastEngine.ts
// Builds the LLM prompt for podcast script generation and parses the response.
// Also provides a local fallback that generates a deterministic script
// when no OpenAI key is available.

import type { CurrentPageStudyModel, VisualAnchor } from "@/lib/insights/currentPageStudyModel";
import type { UltraNote } from "@/lib/notelab/ultraNoteStore";
import type { RecallSet } from "@/lib/recalllab/recallStore";
import type { PodcastMode, PodcastScript, PodcastSegment } from "./podcastTypes";

export interface PodcastBuildContext {
  pageNumber: number;
  bookId: string;
  pageText: string;
  studyModel: CurrentPageStudyModel;
  noteLab: UltraNote[];
  recallLab: RecallSet[];
}

// ---------------------------------------------------------------------------
// Prompt builder — called by /api/podcast-script (server-side).
// ---------------------------------------------------------------------------

function modeInstructions(mode: PodcastMode, hasGuest: boolean): string {
  const guestNote = hasGuest
    ? `Use "host" for the main speaker and "guest" for a curious co-host who asks follow-up questions.`
    : `Use only "host" as the speaker.`;

  switch (mode) {
    case "page_review":
      return `MODE: Page Review. ${guestNote}
Generate 8–10 segments: start with an intro, read and explain the page content, walk through each Right Panel study note conversationally, use highlight evidence moments to anchor the explanation, expand with any NoteLab notes, end with an outro. Keep it educational but conversational.`;

    case "exam_cram":
      return `MODE: Exam Cram. ${guestNote}
Generate 10–12 segments: dense and focused. Prioritize the thesis, mechanism, and common confusion. Insert 2–3 recall quiz breaks drawn from RecallLab cards. No long transitions — cut straight to facts. End with "exam signals" if available.`;

    case "clinical":
      return `MODE: Clinical Connection. ${guestNote}
Generate 8–10 segments: start with the page concept, then connect each Right Panel note to a real-world clinical scenario. For the highlight evidence, explain what a clinician would observe. If the page has a "common confusion," address it from a clinical diagnostic angle. Add an external verification segment citing a trusted clinical source (NIH, clinical guidelines, textbook authors) by name.`;

    case "debate":
      return `MODE: Debate / Host & Guest. Use BOTH "host" and "guest" speakers alternating.
Generate 12–15 segments: host presents the concept; guest challenges with a "but what about…" or "isn't that the same as…" question; host answers with evidence from the highlights; guest connects to the bigger picture; together they arrive at a conclusion. Include a recall quiz segment near the end.`;

    case "quiz_podcast":
      return `MODE: Quiz Podcast. ${guestNote}
Generate 10–12 segments alternating: explain a concept → ask a quiz question → reveal the answer → explain the next concept → repeat. Draw quiz questions primarily from RecallLab cards; if none are available, generate questions from the Right Panel notes. End with a quick review of the hardest question.`;
  }
}

export function buildPodcastPrompt(ctx: PodcastBuildContext, mode: PodcastMode): string {
  const { studyModel, pageText, noteLab, recallLab, pageNumber, bookId } = ctx;
  const sn = studyModel.studyNotes;
  const hasGuest = mode === "debate" || mode === "clinical" || mode === "quiz_podcast";

  const pageSnippet = pageText.slice(0, 700).trim();
  const anchors = studyModel.visualAnchors.slice(0, 5);
  const concepts = studyModel.conceptBlocks.slice(0, 3);
  const noteLabSections = noteLab
    .flatMap((n) => (n.sections ?? []).slice(0, 2))
    .slice(0, 6);
  const recallCards = recallLab
    .flatMap((r) => r.cards.slice(0, 3))
    .slice(0, 6);

  const lines: string[] = [
    `=== PAGE ${pageNumber} CONTEXT ===`,
    `PAGE TEXT (excerpt):\n"${pageSnippet}"`,
    "",
    `=== RIGHT PANEL finalStudyModel ===`,
    `Thesis: ${studyModel.pageThesis}`,
    `Why It Matters: ${sn.whyThisMatters ?? "—"}`,
    `Key Mechanism: ${sn.keyMechanism ?? "—"}`,
    `Common Confusion: ${sn.commonConfusion ?? "—"}`,
    `Memory Anchor: ${sn.quickMemory ?? "—"}`,
    `Exam Signal: ${sn.examSignal ?? "—"}`,
  ];

  if (concepts.length > 0) {
    lines.push("", "CONCEPT BLOCKS:");
    concepts.forEach((c, i) => {
      lines.push(`${i + 1}. ${c.title}: ${c.pattern}${c.mechanism ? " — " + c.mechanism : ""}`);
    });
  }

  if (anchors.length > 0) {
    lines.push("", "=== LEFT PANEL visualAnchors (highlight evidence) ===");
    anchors.forEach((a) => {
      lines.push(`[${a.id}] (${a.sourceField}) "${a.exactText}"`);
    });
  }

  if (noteLabSections.length > 0) {
    lines.push("", "=== NOTELAB SAVED NOTES ===");
    noteLabSections.forEach((s) => {
      lines.push(`${s.label}: ${s.content.slice(0, 120)}`);
    });
  }

  if (recallCards.length > 0) {
    lines.push("", "=== RECALLLAB CARDS ===");
    recallCards.forEach((c) => {
      lines.push(`[${c.id}] Q: ${c.front}\nA: ${c.back}`);
    });
  }

  lines.push(
    "",
    "=== INSTRUCTIONS ===",
    modeInstructions(mode, hasGuest),
    "",
    'Return ONLY a JSON object: { "segments": [...] }',
    "Each segment: { id, type, speaker, text, sourceField?, anchorId?, recallCardId?, noteLabel?, externalTopic? }",
    `type must be one of: intro | page_reading | right_panel_note | highlight_evidence | notelab_expansion | recall_quiz | external_verify | outro`,
    `speaker must be one of: host | guest | narrator`,
    "anchorId must exactly match one of the visualAnchor ids listed above when referencing a highlight.",
    "recallCardId must exactly match one of the RecallLab card ids listed above when quizzing.",
    "text should be 1–3 natural spoken sentences per segment — not bullet points, not headers.",
    "Do not include markdown formatting in text fields.",
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Response parser — validates and normalises raw LLM JSON output.
// ---------------------------------------------------------------------------

export function parsePodcastResponse(
  raw: unknown,
  ctx: Pick<PodcastBuildContext, "pageNumber" | "bookId">,
  mode: PodcastMode,
): PodcastScript {
  const segments: PodcastSegment[] = [];
  let rawSegments: unknown[] = [];

  if (
    raw &&
    typeof raw === "object" &&
    "segments" in raw &&
    Array.isArray((raw as any).segments)
  ) {
    rawSegments = (raw as any).segments;
  } else if (Array.isArray(raw)) {
    rawSegments = raw;
  }

  const VALID_TYPES = new Set([
    "intro", "page_reading", "right_panel_note", "highlight_evidence",
    "notelab_expansion", "recall_quiz", "external_verify", "outro",
  ]);
  const VALID_SPEAKERS = new Set(["host", "guest", "narrator"]);

  for (let i = 0; i < rawSegments.length; i++) {
    const s = rawSegments[i] as any;
    if (!s || typeof s !== "object") continue;
    const text = String(s.text ?? "").trim();
    if (!text) continue;
    const type = VALID_TYPES.has(s.type) ? s.type : "page_reading";
    const speaker = VALID_SPEAKERS.has(s.speaker) ? s.speaker : "host";
    segments.push({
      id: String(s.id ?? `seg-${i}`),
      type,
      speaker,
      text,
      sourceField:    s.sourceField   ? String(s.sourceField)   : undefined,
      anchorId:       s.anchorId      ? String(s.anchorId)      : undefined,
      recallCardId:   s.recallCardId  ? String(s.recallCardId)  : undefined,
      noteLabel:      s.noteLabel     ? String(s.noteLabel)     : undefined,
      externalTopic:  s.externalTopic ? String(s.externalTopic) : undefined,
    });
  }

  const wordCount = segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
  const estimatedMinutes = Math.max(1, Math.round(wordCount / 150));

  return {
    mode,
    pageNumber: ctx.pageNumber,
    bookId:     ctx.bookId,
    segments,
    totalSegments: segments.length,
    estimatedMinutes,
  };
}

// ---------------------------------------------------------------------------
// Local fallback — no LLM required; deterministic script from studyModel.
// ---------------------------------------------------------------------------

function seg(
  idx: number,
  type: PodcastSegment["type"],
  speaker: PodcastSpeaker,
  text: string,
  extra: Partial<PodcastSegment> = {},
): PodcastSegment {
  return { id: `local-${idx}`, type, speaker, text, ...extra };
}

type PodcastSpeaker = "host" | "guest" | "narrator";

export function buildLocalPodcastScript(
  ctx: PodcastBuildContext,
  mode: PodcastMode,
): PodcastScript {
  const { studyModel, recallLab, noteLab, pageNumber, bookId } = ctx;
  const sn = studyModel.studyNotes;
  const segments: PodcastSegment[] = [];
  let i = 0;

  const firstAnchor: VisualAnchor | undefined = studyModel.visualAnchors[0];
  const recallCards = recallLab.flatMap((r) => r.cards).slice(0, 3);
  const noteSection = noteLab.flatMap((n) => n.sections ?? []).slice(0, 2);

  // Intro
  segments.push(seg(i++, "intro", "host",
    `Welcome to page ${pageNumber}. Today we're covering: ${studyModel.pageThesis}.`));

  // Thesis
  if (sn.whyThisMatters) {
    segments.push(seg(i++, "right_panel_note", "host",
      `Why does this matter? ${sn.whyThisMatters}`, { sourceField: "whyThisMatters" }));
  }

  // Mechanism
  if (sn.keyMechanism) {
    segments.push(seg(i++, "right_panel_note", "host",
      `Here's the key mechanism: ${sn.keyMechanism}`, { sourceField: "keyMechanism" }));
  }

  // Highlight evidence
  if (firstAnchor) {
    segments.push(seg(i++, "highlight_evidence", "host",
      `The page states directly: "${firstAnchor.exactText}"`,
      { anchorId: firstAnchor.id, sourceField: firstAnchor.sourceField }));
  }

  // Common confusion
  if (sn.commonConfusion) {
    segments.push(seg(i++, "right_panel_note", "host",
      `Common confusion alert: ${sn.commonConfusion}`, { sourceField: "commonConfusion" }));
  }

  // NoteLab expansion
  if (noteSection.length > 0) {
    segments.push(seg(i++, "notelab_expansion", "host",
      `From your saved notes — ${noteSection[0].label}: ${noteSection[0].content.slice(0, 180)}`,
      { noteLabel: noteSection[0].label }));
  }

  // Recall quiz break (if cards exist and mode calls for it)
  if (recallCards.length > 0 && (mode === "exam_cram" || mode === "quiz_podcast")) {
    const c = recallCards[0];
    segments.push(seg(i++, "recall_quiz", "host",
      `Quiz break: ${c.front}`, { recallCardId: c.id }));
    segments.push(seg(i++, "recall_quiz", "host",
      `The answer: ${c.back}`, { recallCardId: c.id }));
  }

  // Memory anchor
  if (sn.quickMemory) {
    segments.push(seg(i++, "right_panel_note", "host",
      `Memory anchor: ${sn.quickMemory}`, { sourceField: "quickMemory" }));
  }

  // Outro
  segments.push(seg(i++, "outro", "host",
    `That's page ${pageNumber}. Review your highlights, check your NoteLab notes, and run the Recall cards before moving on.`));

  const wordCount = segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0);

  console.log("[PODCAST_SCRIPT_CREATED]", {
    page:      pageNumber,
    mode,
    source:    "local-fallback",
    segments:  segments.length,
    wordCount,
    hasAnchors: !!firstAnchor,
    hasRecall:  recallCards.length > 0,
    hasNoteLab: noteSection.length > 0,
  });

  return {
    mode,
    pageNumber,
    bookId,
    segments,
    totalSegments: segments.length,
    estimatedMinutes: Math.max(1, Math.round(wordCount / 150)),
  };
}
