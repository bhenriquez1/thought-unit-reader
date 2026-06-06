// lib/podcast/podcastEngine.ts
// Builds the LLM prompt for podcast script generation and parses the response.
// Also provides a local fallback that generates a deterministic script
// when no OpenAI key is available.

import type { CurrentPageStudyModel, VisualAnchor } from "@/lib/insights/currentPageStudyModel";
import type { UltraNote } from "@/lib/notelab/ultraNoteStore";
import type { RecallSet } from "@/lib/recalllab/recallStore";
import type { PodcastMode, PodcastScript, PodcastSegment } from "./podcastTypes";
import { MODE_THEMES } from "./podcastTypes";

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

function modeInstructions(mode: PodcastMode): string {
  const theme = MODE_THEMES[mode];
  const H = theme.hostName;
  const G = theme.guestName;

  switch (mode) {
    case "page_review":
      return `MODE: Page Review Studio.
SPEAKERS: "${H}" (${theme.hostRole}) and "${G}" (${theme.guestRole}). Alternate naturally.
Use speaker="host" for ${H} and speaker="guest" for ${G}.

Generate 9–11 segments:
1. Intro: ${H} sets the scene in 1-2 sentences. ${G} reacts briefly ("Got it", "So we're on page…").
2. Thesis walkthrough: ${H} explains the main idea. ${G} asks "What does that actually mean for us?"
3-5. Each Right Panel note as a short back-and-forth: ${H} states the note, ${G} responds with "Wait—" or "So that means…" or "Exactly, and…"
6. Evidence moment: ${H} says "The page literally states:" and quotes the highlight. ${G}: "I can see that highlighted."
7-8. NoteLab expansion if available, with ${G} connecting to prior knowledge.
9. Confusion check: ${G} raises the common confusion. ${H} corrects it cleanly.
10. Outro: ${H} summarizes in one sentence. ${G}: "Perfect. Moving on."

Dialogue rules: Short turns (1-2 sentences). Use natural starts: "Right,", "So—", "Exactly.", "Good catch.", "Hold on—", "And that's where students slip up.", "The key phrase is…"`;

    case "exam_cram":
      return `MODE: Exam Cram — high-yield rapid review.
SPEAKERS: "${H}" and "${G}" alternating as co-hosts, both using speaker="host" and speaker="guest".

Generate 11–13 segments:
1. Rapid intro: "Okay, let's go. Page ${"{pageNumber}"}. Thesis—" and immediately state it.
2-4. High-yield fact drops: Each note as a rapid 1-sentence statement + 1-sentence drill: "If X, think Y."
5. Mechanism drill: state mechanism, then "${G}: What's the step after that?" — short answer.
6-7. Confusion flag: "${H}: Common mistake—" then the confusion. "${G}: And the correct answer is?"
8-9. Two recall quiz breaks: "${H}: Quick—" question, pause, "${G}: The answer:" reveal.
10. Memory anchor: 1 mnemonic or shortcut.
11. Exam signal: "If you see this in a vignette, the answer is…"
12-13. Rapid outro + hardest point repeat.

Dialogue rules: Fast pace. No filler. Start segments with: "Rapid—", "Quick—", "That's a trap.", "Board loves this.", "Don't forget:", "The answer is always…"`;

    case "clinical":
      return `MODE: Clinical Conference Room.
SPEAKERS: "${H}" (${theme.hostRole}) and "${G}" (${theme.guestRole}). Formal but conversational, like an attending teaching at bedside.

Generate 9–11 segments:
1. Case intro: "${H}: Let's talk about what we're seeing on page ${"{pageNumber}"}." ${G}: "Is this the mechanism behind…?"
2. Concept contextualization: ${H} explains the core concept in clinical terms. No jargon without explanation.
3-5. Each Right Panel note mapped to a clinical scenario: "So if our patient has X, we'd expect to see…"
6. Evidence anchor: ${H} cites the highlight: "The literature says—and I want you to remember this verbatim—"
7. Diagnosis/treatment application: ${G}: "How would this change our management?" ${H}: specific answer.
8. Common confusion in clinical context: "Residents often confuse this with…" — then the distinction.
9. Attending pearl: ${H} gives a clinical memory aid or rule of thumb.
10. External verify: ${H} references a clinical guideline or author by name (e.g., "As Harrison's puts it…").
11. Outro: "${G}: So the take-home is…?" ${H}: one clean sentence.

Dialogue rules: ${G} should ask genuine clinical questions. Start ${G} turns with: "So in practice,", "If the patient presents with,", "What about the case where,", "I've seen attendings say…"`;

    case "debate":
      return `MODE: Avrrio Rounds Studio — evidence-based debate.
SPEAKERS: "${H}" (${theme.hostRole}) and "${G}" (${theme.guestRole}). Both confident, pushing back respectfully.

Generate 13–16 segments:
1. ${H} opens: sets the central claim from the page thesis. Confident.
2. ${G} challenges: "But isn't that the same as…?" or "Wait — doesn't that contradict…?"
3. ${H} rebuts with evidence from the highlights: cites anchor text directly.
4. ${G}: "Okay but what about the common confusion here?" — raises the confusion note.
5. ${H}: "That's exactly the trap." — explains the correct distinction.
6. ${G}: "So your position is that…?" — forces ${H} to commit.
7-9. Each concept block gets a challenge-rebuttal pair.
10. ${G}: "Show me the evidence." ${H} quotes a highlight anchor.
11. Recall quiz segment: ${G} poses a challenge question to the listener. ${H} reveals answer.
12-14. Building to consensus: "So we both agree that…" — synthesis.
15. Outro: ${H} and ${G} state the one sentence both sides agree on.

Dialogue rules: Short punchy turns. ${G} starts challenges with: "But—", "Hold on.", "I'd push back on that.", "Isn't that just…", "The problem with that argument is…"`;

    case "quiz_podcast":
      return `MODE: Recall Challenge — game show format.
SPEAKERS: "${H}" (Host) and "${G}" (Contestant). Energetic and fun but academic.

Generate 11–14 segments:
1. ${H} opens with game-show energy: "Welcome back to the Recall Challenge! Page ${"{pageNumber}"} — let's go!"
2. ${H} explains the concept quickly (1-2 sentences). ${G}: "Got it."
3. ${H}: "First question—" poses a question from the Right Panel or RecallLab. (type: recall_quiz)
4. ${G}: attempts an answer ("Is it…?"). Pause, suspense.
5. ${H}: "The answer is—" reveals correct answer with brief explanation.
6. Segue: ${H} explains next concept. ${G}: "So this relates to the first one by…?"
7. ${H}: "Bonus question—" harder question.
8. ${G} answers. ${H} gives feedback: "Exactly right!" or "Good try — the key distinction is…"
9-11. Repeat question-answer pattern for remaining study notes.
12. ${H}: "Lightning round! No explanations." 2-3 rapid-fire Q&As.
13. ${G}: "Which one was hardest?" ${H} reviews the most important concept.
14. Outro: ${H}: "That's the Recall Challenge for page ${"{pageNumber}"}. Review your anchors and run those cards!"

Dialogue rules: ${H} uses game-show phrasing. Start quiz segments with: "Question—", "Alright—", "Here's a tough one:", "Category: [study note field]—"`;
  }
}

export function buildPodcastPrompt(ctx: PodcastBuildContext, mode: PodcastMode): string {
  const { studyModel, pageText, noteLab, recallLab, pageNumber, bookId } = ctx;
  const sn = studyModel.studyNotes;
  const hasGuest = true; // all modes now have two named speakers

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

  const theme = MODE_THEMES[mode];
  lines.push(
    "",
    "=== INSTRUCTIONS ===",
    modeInstructions(mode).replace(/\$\{pageNumber\}/g, String(pageNumber)),
    "",
    'Return ONLY a JSON object: { "segments": [...] }',
    `Each segment: { id, type, speaker, text, sourceField?, anchorId?, recallCardId?, noteLabel?, externalTopic? }`,
    `type must be one of: intro | page_reading | right_panel_note | highlight_evidence | notelab_expansion | recall_quiz | external_verify | outro`,
    `speaker must be one of: host | guest | narrator`,
    `Named speakers: speaker="host" means ${theme.hostName} (${theme.hostRole}), speaker="guest" means ${theme.guestName} (${theme.guestRole}).`,
    `Use their NAMES naturally in the text (e.g. "${theme.hostName}: So here's the thing..." or "${theme.guestName}: Wait—").`,
    "anchorId must exactly match one of the visualAnchor ids listed above when referencing a highlight.",
    "recallCardId must exactly match one of the RecallLab card ids listed above when quizzing.",
    "text must be 1–2 natural spoken sentences only — short turns, not lectures.",
    "Use natural transitions and reactions between speakers. Do not include markdown formatting.",
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

  const theme = MODE_THEMES[mode];
  const H = theme.hostName;
  const G = theme.guestName;

  const firstAnchor: VisualAnchor | undefined = studyModel.visualAnchors[0];
  const recallCards = recallLab.flatMap((r) => r.cards).slice(0, 3);
  const noteSection = noteLab.flatMap((n) => n.sections ?? []).slice(0, 2);

  // Intro
  segments.push(seg(i++, "intro", "host",
    `${H}: Alright — page ${pageNumber}. The thesis here: ${studyModel.pageThesis}`));
  segments.push(seg(i++, "intro", "guest",
    `${G}: Got it. So what's the "why" behind this?`));

  // Why it matters
  if (sn.whyThisMatters) {
    segments.push(seg(i++, "right_panel_note", "host",
      `${H}: Good question. ${sn.whyThisMatters}`, { sourceField: "whyThisMatters" }));
    segments.push(seg(i++, "right_panel_note", "guest",
      `${G}: Right — so it's about the bigger picture, not just memorizing a fact.`));
  }

  // Mechanism
  if (sn.keyMechanism) {
    segments.push(seg(i++, "right_panel_note", "host",
      `${H}: Here's the mechanism you need to know. ${sn.keyMechanism}`, { sourceField: "keyMechanism" }));
    segments.push(seg(i++, "right_panel_note", "guest",
      `${G}: And if I missed that step, the whole chain breaks down.`));
  }

  // Highlight evidence
  if (firstAnchor) {
    segments.push(seg(i++, "highlight_evidence", "host",
      `${H}: The page literally says — and I want you to highlight this — "${firstAnchor.exactText}"`,
      { anchorId: firstAnchor.id, sourceField: firstAnchor.sourceField }));
    segments.push(seg(i++, "highlight_evidence", "guest",
      `${G}: I can see that highlighted in the left panel. That's the anchor.`));
  }

  // Common confusion
  if (sn.commonConfusion) {
    segments.push(seg(i++, "right_panel_note", "guest",
      `${G}: Wait — I've seen students confuse this with something else.`, { sourceField: "commonConfusion" }));
    segments.push(seg(i++, "right_panel_note", "host",
      `${H}: Exactly — that's the trap. ${sn.commonConfusion}`, { sourceField: "commonConfusion" }));
  }

  // NoteLab expansion
  if (noteSection.length > 0) {
    segments.push(seg(i++, "notelab_expansion", "host",
      `${H}: You actually saved a note on this. ${noteSection[0].label}: ${noteSection[0].content.slice(0, 140)}`,
      { noteLabel: noteSection[0].label }));
  }

  // Recall quiz break
  if (recallCards.length > 0 && (mode === "exam_cram" || mode === "quiz_podcast")) {
    const c = recallCards[0];
    segments.push(seg(i++, "recall_quiz", "host",
      `${H}: Quick quiz — ${c.front}`, { recallCardId: c.id }));
    segments.push(seg(i++, "recall_quiz", "guest",
      `${G}: Is it…? (pause)`, { recallCardId: c.id }));
    segments.push(seg(i++, "recall_quiz", "host",
      `${H}: The answer: ${c.back}`, { recallCardId: c.id }));
  }

  // Memory anchor
  if (sn.quickMemory) {
    segments.push(seg(i++, "right_panel_note", "host",
      `${H}: Memory anchor — ${sn.quickMemory}`, { sourceField: "quickMemory" }));
  }

  // Outro
  segments.push(seg(i++, "outro", "guest",
    `${G}: So what's the one-line takeaway?`));
  segments.push(seg(i++, "outro", "host",
    `${H}: Page ${pageNumber}: ${studyModel.pageThesis?.slice(0, 80) ?? "review your highlights and run the Recall cards."}. That's the one.`));

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
