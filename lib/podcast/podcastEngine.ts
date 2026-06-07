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
// Subject type detection — inferred from page text and study model.
// ---------------------------------------------------------------------------

type SubjectType =
  | "biology" | "anatomy" | "physiology" | "chemistry" | "organic_chemistry"
  | "physics" | "calculus" | "statistics" | "medicine" | "dentistry"
  | "history" | "psychology" | "business" | "law" | "computer_science" | "general";

export function detectSubjectType(pageText: string, studyModel: CurrentPageStudyModel): SubjectType {
  const combined = (pageText + " " + studyModel.pageThesis + " " + Object.values(studyModel.studyNotes).filter(Boolean).join(" ")).toLowerCase();

  if (/\b(diagnosis|pathophysiology|treatment|symptom|prognosis|contraindication|dosage|pharmacology|medication|clinical|patient|disease|syndrome|etiology|complication|differential)\b/.test(combined)) return "medicine";
  if (/\b(tooth|dental|caries|pulp|enamel|dentin|occlusion|periodontal|extraction|crown|root canal|dat exam|dat prep)\b/.test(combined)) return "dentistry";
  if (/\b(derivative|integral|limit|convergence|epsilon|delta|calculus|differentiation|antiderivative|riemann|theorem|proof|diverge|series|sequence)\b/.test(combined)) return "calculus";
  if (/\b(p-value|hypothesis|regression|variance|standard deviation|t-test|anova|chi-square|confidence interval|sample size|correlation|probability distribution|null hypothesis)\b/.test(combined)) return "statistics";
  if (/\b(newton|force|momentum|velocity|acceleration|quantum|thermodynamics|entropy|electromagnetic|wavelength|frequency|kinetic energy|potential energy|coulomb|ohm|ampere|voltage)\b/.test(combined)) return "physics";
  if (/\b(reaction|reagent|organic|carbonyl|ester|aldehyde|ketone|alkene|alkyne|benzene|aromatic|stereochemistry|nucleophile|electrophile|mechanism|sn1|sn2|e1|e2)\b/.test(combined)) return "organic_chemistry";
  if (/\b(molecule|atom|element|compound|bond|ion|acid|base|oxidation|reduction|mole|stoichiometry|periodic table|electron|proton|neutron|ph|buffer|equilibrium|entropy|enthalpy)\b/.test(combined)) return "chemistry";
  if (/\b(cell|dna|rna|protein|enzyme|receptor|membrane|mitosis|meiosis|evolution|genetics|chromosome|atp|metabolism|photosynthesis|ecosystem|organism|species)\b/.test(combined)) return "biology";
  if (/\b(muscle|nerve|bone|organ|tissue|skeleton|artery|vein|neuron|brain|spinal|anatomical|dissect|cadaver|innervate|ligament|tendon)\b/.test(combined)) return "anatomy";
  if (/\b(homeostasis|hormone|gland|feedback|endocrine|nervous system|digestion|cardiovascular|respiratory|renal|immune|lymphatic|reflex|blood pressure|cardiac output)\b/.test(combined)) return "physiology";
  if (/\b(algorithm|data structure|recursion|complexity|programming|function|variable|class|object|binary|loop|array|sort|graph|tree|compiler|database|api)\b/.test(combined)) return "computer_science";
  if (/\b(historical|century|war|civilization|empire|revolution|democracy|colonialism|treaty|ideology|economy|trade route|industrialization)\b/.test(combined)) return "history";
  if (/\b(behavior|cognition|perception|memory|motivation|personality|disorder|therapy|neuroscience|stimulus|response|conditioning|social|emotion)\b/.test(combined)) return "psychology";
  if (/\b(market|supply|demand|revenue|profit|cost|management|strategy|accounting|finance|economics|investment|entrepreneur|organization|leadership)\b/.test(combined)) return "business";
  if (/\b(statute|regulation|contract|liability|tort|constitutional|precedent|plaintiff|defendant|jurisdiction|counsel|amendment|legal|court)\b/.test(combined)) return "law";

  return "general";
}

// Subject-aware speaker names
function speakerNames(subject: SubjectType): { host: string; guest: string } {
  switch (subject) {
    case "medicine":
    case "physiology": return { host: "Dr. Rivera", guest: "Resident" };
    case "dentistry":  return { host: "Dr. Chen", guest: "Student" };
    case "calculus":
    case "statistics":
    case "physics":    return { host: "Professor", guest: "Student" };
    case "biology":
    case "anatomy":
    case "chemistry":
    case "organic_chemistry": return { host: "Instructor", guest: "Student" };
    case "history":    return { host: "Historian A", guest: "Historian B" };
    case "psychology": return { host: "Dr. Patel", guest: "Student" };
    case "business":   return { host: "Professor", guest: "Analyst" };
    case "law":        return { host: "Professor", guest: "Law Student" };
    default:           return { host: "Host", guest: "Guest" };
  }
}

// ---------------------------------------------------------------------------
// Prompt builder — called by /api/podcast-script (server-side).
// ---------------------------------------------------------------------------

function modeInstructions(mode: PodcastMode, hasGuest: boolean, subject: SubjectType): string {
  const { host, guest } = speakerNames(subject);
  const guestNote = hasGuest
    ? `Use "${host}" for the main speaker and "${guest}" for a curious co-host who asks follow-up questions.`
    : `Use only "${host}" as the speaker.`;

  // Subject-specific context for each mode
  const subjectContext: Partial<Record<SubjectType, string>> = {
    medicine: "Use clinical reasoning. Frame explanation as: finding → mechanism → consequence → what not to miss.",
    dentistry: "Frame as DAT exam prep. Connect concepts to clinical dentistry and board exam relevance.",
    calculus: "Frame as a math lecture. Use precise condition → theorem → proof structure. Include worked examples.",
    statistics: "Frame around data interpretation. Connect to research design and significance testing.",
    physics: "Frame around physical laws. Use F=ma style notation expanded verbally. Include real-world applications.",
    organic_chemistry: "Frame around reaction mechanisms. Use nucleophile/electrophile language. Explain why bonds form or break.",
    chemistry: "Frame around atomic and molecular principles. Connect structure to function.",
    biology: "Frame around evolutionary purpose and molecular mechanisms. Explain why, not just what.",
    anatomy: "Frame around clinical relevance. Connect structure to function to pathology.",
    physiology: "Frame around homeostatic mechanisms and feedback loops.",
    history: "Frame as historical analysis. Argue causation, not just chronology.",
    psychology: "Frame around evidence-based psychological mechanisms and real-world behavioral examples.",
    business: "Frame around strategic decision-making and real-world case applications.",
    law: "Frame around legal reasoning: rule → application → exception → exam trap.",
    computer_science: "Frame around algorithmic thinking and computational complexity.",
  };
  const subjectNote = subjectContext[subject] ?? "Adapt to the subject matter on this page.";

  switch (mode) {
    case "page_review":
      return `MODE: Page Review (Professor Walkthrough). ${guestNote}
${subjectNote}
Generate 8–10 segments structured as a professor's 2-minute explanation:
1. Open with what the page fundamentally teaches (not a list — a thesis statement)
2. Walk through the mechanism: what causes what, and why it matters
3. Give a concrete real-world or clinical example
4. Flag the most common student misconception
5. End with a memory anchor or takeaway
Voice: educational, flowing, like a professor talking to a student — not reading bullet points.
Each segment should be 2–4 natural spoken sentences. No headers, no bullets.`;

    case "exam_cram":
      return `MODE: Exam Cram (High-Yield Review). ${guestNote}
${subjectNote}
Generate 10–12 high-yield segments:
1. State the exam-critical idea first — what would appear on a board exam
2. For each Right Panel study note: compress to one HIGH YIELD statement
3. Insert 2–3 recall quiz breaks: ask the question, pause, reveal answer
4. Flag the trap — what students get wrong and why the correct answer is what it is
5. End with "This WILL appear on the exam because…"
Voice: urgent, focused, like a board-review coach. Short, punchy sentences.
Each segment: 1–2 sentences maximum. No fluff.`;

    case "clinical":
      // Subject-adaptive: clinical framing varies by subject
      if (subject === "medicine" || subject === "physiology" || subject === "anatomy") {
        return `MODE: Clinical Conference. Use BOTH "${host}" and "${guest}" speakers alternating.
Present as a real patient case discussion:
Segment 1 (${guest}): Present the patient — symptoms, vitals, labs, relevant history
Segment 2 (${host}): What's the differential diagnosis? Walk through most likely → less likely
Segment 3 (${host}): Key mechanism — the pathophysiology that explains this presentation
Segment 4 (${host}): Diagnosis and treatment rationale — why this treatment for this mechanism
Segment 5 (${guest}): Ask "What would we miss if we didn't know this?" — common pitfall
Segment 6 (${host}): Exam pearl — what a board question on this would test
Generate 8–10 total segments. Real patient voices, not textbook narration.`;
      }
      if (subject === "dentistry") {
        return `MODE: Dental Clinical Case. Use BOTH "${host}" and "${guest}" speakers alternating.
Present as a dental patient case:
Segment 1 (${guest}): Present the case — chief complaint, relevant findings, radiograph description
Segment 2 (${host}): Differential diagnosis from DAT perspective
Segment 3 (${host}): Mechanism — what's happening at the tissue/molecular level
Segment 4 (${host}): Treatment plan and rationale
Segment 5 (${guest}): "What would the DAT ask about this?" — exam angle
Generate 8–10 total segments.`;
      }
      if (subject === "organic_chemistry" || subject === "chemistry") {
        return `MODE: Real-World Application. ${guestNote}
${subjectNote}
Generate 8–10 segments connecting each concept to a real application:
• Drug metabolism, industrial synthesis, environmental chemistry, or materials science
• For each mechanism, explain what happens in the real world when this reaction occurs
• Include a "practitioner perspective" segment: how a chemist would use this knowledge`;
      }
      return `MODE: Real-World Application. ${guestNote}
${subjectNote}
Generate 8–10 segments connecting this page's concepts to concrete real-world scenarios:
• Start with the core concept as it appears in practice
• For each Right Panel note, give a specific real-world scenario where it applies
• If there's a common confusion, address it from an applied/analytical angle
• End with an external verification citing a trusted source by name`;

    case "debate":
      if (subject === "history") {
        return `MODE: Historical Debate. Use BOTH "${host}" and "${guest}" speakers alternating.
Structure:
${host}: "The primary cause of [topic] was [factor A]. Here's the evidence…"
${guest}: "I'd argue [factor B] played a larger role. Consider that…"
${host}: "The page specifically addresses this: [cite highlight evidence]"
${guest}: "But that interpretation misses [counterpoint]…"
${host}: "So the synthesis is: both factors interacted because…"
Generate 12–15 segments. Each speaker makes a genuine argument — not a softball exchange.
The debate should reach a real conclusion, not just state opposing views.`;
      }
      return `MODE: Evidence Debate. Use BOTH "${host}" and "${guest}" speakers alternating.
Structure:
${host}: Presents the central concept clearly
${guest}: Challenges with "But why does that happen?" or "Isn't that the same as X?"
${host}: Responds with highlight evidence from the page (cite directly)
${guest}: Digs deeper — "What would happen if [condition changed]?"
${host}: Connects to the bigger picture — why this principle matters beyond this page
Together: arrive at a memorable conclusion the student can recall on an exam
Generate 12–15 segments. Each exchange must advance understanding — no agreement theater.
Include one recall quiz segment near the end.`;

    case "quiz_podcast":
      if (subject === "dentistry" || subject === "medicine") {
        return `MODE: Board Exam Quiz Show. ${guestNote}
${subjectNote}
Generate 10–12 segments alternating:
1. Explain a high-yield concept (1–2 sentences)
2. Ask a board-style question: "Which of the following is most likely…" or "What is the mechanism of…"
3. After a dramatic pause: reveal the answer and explain WHY the correct answer is correct AND why the wrong answers are wrong
Repeat for each key concept.
End with: "The hardest question on this page would be…" and walk through it slowly.
Voice: quiz show energy — build suspense before revealing answers.`;
      }
      return `MODE: Quiz Podcast. ${guestNote}
${subjectNote}
Generate 10–12 segments alternating:
1. Explain a concept (1–2 sentences)
2. Ask a question testing understanding — not recall, but reasoning
3. Reveal the answer with explanation: why correct + what the wrong answer would assume
Repeat for each key concept.
End with the hardest question on this page and a full walkthrough.
Voice: engaging, like a game show — build curiosity before revealing answers.`;
  }
}

export function buildPodcastPrompt(ctx: PodcastBuildContext, mode: PodcastMode): string {
  const { studyModel, pageText, noteLab, recallLab, pageNumber, bookId } = ctx;
  const sn = studyModel.studyNotes;
  const subject = detectSubjectType(pageText, studyModel);
  const hasGuest = mode === "debate" || mode === "clinical" || mode === "quiz_podcast";
  console.log("[PODCAST_SUBJECT_DETECTED]", { subject, mode, page: pageNumber });

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
    modeInstructions(mode, hasGuest, subject),
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
