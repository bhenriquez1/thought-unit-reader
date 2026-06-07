// lib/podcast/podcastEngine.ts
// Builds the LLM prompt for podcast script generation and parses the response.
// Subject-adaptive: detects the book domain and adjusts personas/style.

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
// Subject detection — infers domain from page text + studyModel
// ---------------------------------------------------------------------------

export type SubjectType =
  | "medical" | "dental" | "anatomy" | "physiology" | "pharmacology" | "pathology"
  | "chemistry" | "biology" | "physics" | "math" | "engineering"
  | "history" | "business" | "psychology" | "law" | "literature" | "general";

export function detectSubjectType(
  pageText: string,
  studyModel?: Pick<CurrentPageStudyModel, "pageThesis" | "studyNotes">,
): SubjectType {
  const corpus = [
    pageText,
    studyModel?.pageThesis ?? "",
    studyModel?.studyNotes?.keyMechanism ?? "",
    studyModel?.studyNotes?.whyThisMatters ?? "",
  ].join(" ").toLowerCase();

  if (/\b(diagnosis|patient|symptom|treatment|prognosis|clinical|hospital|medication|drug|dose|contraindication|side effect|pathogen|infection|surgery|cardiac|pulmonary|renal|hepatic|neurolog|oncolog|pediatr|obstetric|gynecolog|pharmacok)\b/.test(corpus)) return "medical";
  if (/\b(tooth|teeth|dental|caries|periodontal|endodontic|pulp|dentin|enamel|alveolar|mandible|maxilla|occlusion|orthodontic|crown|restoration|extraction|oral mucosa|salivary|TMJ)\b/.test(corpus)) return "dental";
  if (/\b(muscle|bone|joint|ligament|tendon|nerve|artery|vein|organ|skeleton|anatomy|cadaver|dissection|kinesiology|biomechanics|musculoskeletal)\b/.test(corpus)) return "anatomy";
  if (/\b(homeostasis|hormone|feedback|receptor|signal transduction|metabolism|respiration|cardiovascular|renal|endocrine|nervous system|action potential|membrane potential|osmosis|diffusion|enzyme kinetics)\b/.test(corpus)) return "physiology";
  if (/\b(drug|pharmacokinetics|pharmacodynamics|receptor|agonist|antagonist|toxicity|therapeutic index|bioavailability|half.life|mechanism of action|adverse effect)\b/.test(corpus)) return "pharmacology";
  if (/\b(disease|lesion|biopsy|necrosis|inflammation|neoplasm|tumor|carcinoma|histology|pathophysiology|etiology|prognosis|complication)\b/.test(corpus)) return "pathology";
  if (/\b(molecule|compound|reaction|reagent|bond|orbital|stoichiometry|titration|mole|equilibrium|catalyst|oxidation|reduction|entropy|enthalpy|polymer|organic|inorganic|acid|base|buffer)\b/.test(corpus)) return "chemistry";
  if (/\b(cell|organism|evolution|genetics|dna|rna|protein|chromosome|mutation|natural selection|ecosystem|photosynthesis|mitosis|meiosis|phylogeny|taxonomy|microbiome)\b/.test(corpus)) return "biology";
  if (/\b(force|energy|momentum|velocity|acceleration|gravity|friction|torque|quantum|wave|frequency|wavelength|electromagnetic|electric|magnetic|thermodynamics|entropy|heat|pressure|fluid)\b/.test(corpus)) return "physics";
  if (/\b(theorem|proof|equation|polynomial|matrix|vector|integral|derivative|limit|function|variable|coefficient|algebra|geometry|calculus|trigonometry|logarithm|probability|statistics)\b/.test(corpus)) return "math";
  if (/\b(circuit|voltage|current|resistor|capacitor|inductor|amplifier|transistor|semiconductor|algorithm|data structure|compiler|network|protocol|software|hardware|system design|thermodynamics|mechanics|statics|dynamics|material|stress|strain)\b/.test(corpus)) return "engineering";
  if (/\b(historical|war|empire|revolution|civilization|politics|government|constitution|democracy|monarch|colony|trade|migration|culture|religion|philosophy|feudal|renaissance|enlightenment)\b/.test(corpus)) return "history";
  if (/\b(market|supply|demand|revenue|profit|investment|finance|accounting|economics|strategy|management|consumer|competition|brand|pricing|GDP|inflation|interest rate)\b/.test(corpus)) return "business";
  if (/\b(behavior|cognition|emotion|memory|perception|personality|disorder|therapy|DSM|anxiety|depression|neuroscience|learning|conditioning|social|developmental)\b/.test(corpus)) return "psychology";
  if (/\b(statute|regulation|jurisdiction|plaintiff|defendant|tort|contract|criminal|civil|liability|precedent|common law|constitutional|rights)\b/.test(corpus)) return "law";
  return "general";
}

// ---------------------------------------------------------------------------
// Subject-aware personas and mode instructions
// ---------------------------------------------------------------------------

function getPersonas(subject: SubjectType, mode: PodcastMode): { host: string; guest: string } {
  const isClinical = ["medical","dental","anatomy","physiology","pharmacology","pathology"].includes(subject);
  const isScience  = ["chemistry","biology","physics","engineering"].includes(subject);

  if (mode === "debate") {
    if (isClinical) return { host: "Dr. Rivera (attending)", guest: "Dr. Chen (resident)" };
    if (subject === "math")    return { host: "Prof. Martinez", guest: "Student Alex" };
    if (subject === "physics") return { host: "Prof. Khan", guest: "Student Sam" };
    if (isScience)  return { host: "Prof. Lee", guest: "Student Jordan" };
    if (subject === "history") return { host: "Prof. Williams", guest: "Student Riley" };
    if (subject === "business") return { host: "Prof. Thompson", guest: "Student Casey" };
    return { host: "Instructor", guest: "Student" };
  }

  if (mode === "clinical") {
    if (isClinical) return { host: "Attending", guest: "Resident" };
    if (subject === "math")     return { host: "Professor", guest: "Problem solver" };
    if (subject === "physics")  return { host: "Engineer", guest: "Analyst" };
    if (subject === "chemistry") return { host: "Lab instructor", guest: "Lab student" };
    if (subject === "biology")  return { host: "Researcher", guest: "Lab student" };
    if (subject === "history")  return { host: "Historian", guest: "Analyst" };
    if (subject === "business") return { host: "Case leader", guest: "Analyst" };
    return { host: "Instructor", guest: "Learner" };
  }

  return { host: "Host", guest: "Guest" };
}

function modeInstructions(mode: PodcastMode, hasGuest: boolean, subject: SubjectType): string {
  const gNote = hasGuest
    ? `Use "host" and "guest" speakers alternating throughout.`
    : `Use only "host" as the speaker.`;

  const isClinical = ["medical","dental","anatomy","physiology","pharmacology","pathology"].includes(subject);
  const isScience  = ["chemistry","biology","physics","engineering"].includes(subject);
  const isMath     = subject === "math";

  switch (mode) {
    case "page_review":
      return `MODE: Page Review — professor-style walkthrough. ${gNote}
Generate 8–10 segments: start with a short intro that frames what this page covers, then walk through each study note conversationally as if explaining to a student who just read the page. Use "let me walk you through" and "here's what this means" language. Include highlight evidence moments. End with a summary and what to review next.`;

    case "exam_cram":
      return `MODE: Exam Cram — high-yield rapid review. ${gNote}
Generate 10–12 segments. Be DENSE and FAST. Open with the thesis as a one-liner. Then drill: mechanism → common confusion → exam signal → memory anchor. Insert 2–3 quiz questions drawn from RecallLab cards ("Quick question — ..."). Label highest-priority facts. End with "Exam tip: ..." and a rapid fire list of must-know facts. No filler, no transitions longer than one sentence.`;

    case "quiz_podcast":
      return `MODE: Recall Challenge — game-show quiz. ${gNote}
Generate 10–12 segments. Style: upbeat game-show host. Pattern: explain a concept (2 sentences) → ask a quiz question starting with "Okay, question!" → dramatic pause line ("Think about it...") → reveal the answer → brief explanation → next concept. Draw questions from RecallLab cards. End with "Final score recap" summarizing what was covered.`;

    case "debate": {
      const personas = getPersonas(subject, "debate");
      if (isClinical) {
        return `MODE: Avrrio Rounds — attending with residents. Use "host" for ${personas.host} and "guest" for ${personas.guest}.
Generate 12–15 segments: attending presents the mechanism/diagnosis/treatment approach; resident asks a clarifying question ("What about...?"); attending answers with evidence from the study notes and highlights; resident then connects to a related concept or asks about a common confusion; they arrive at a clinical conclusion together. Include a self-quiz segment near the end.`;
      }
      if (isMath) {
        return `MODE: Avrrio Rounds — professor with students solving together. Use "host" for ${personas.host} and "guest" for ${personas.guest}.
Generate 12–15 segments: professor introduces the concept/theorem/formula; student asks "But why does that work?"; professor demonstrates with a step-by-step example; student connects it to a previous concept or asks about a common mistake; they work through the logic together. Include a "Try this" problem near the end.`;
      }
      if (isScience) {
        return `MODE: Avrrio Rounds — professor with students debating mechanism. Use "host" for ${personas.host} and "guest" for ${personas.guest}.
Generate 12–15 segments: professor presents the core mechanism or reaction; student challenges with "Isn't that different from...?" or "What if...?"; professor responds with evidence from the highlights; student connects to the broader concept; both arrive at the key insight. Include a mechanism quiz near the end.`;
      }
      return `MODE: Avrrio Rounds — instructor with students debating interpretation. Use "host" for ${personas.host} and "guest" for ${personas.guest}.
Generate 12–15 segments: instructor presents the concept; student challenges or asks "But what caused...?"; instructor answers with evidence; student connects to a bigger picture; together they arrive at the key insight. Include a recall quiz near the end.`;
    }

    case "clinical": {
      if (isClinical) {
        return `MODE: Clinical Conference — patient case discussion. ${gNote}
Generate 8–10 segments: present a realistic patient or clinical scenario that directly involves the page concept; walk through Symptom → Mechanism → Diagnosis → Treatment using the study notes as evidence; reference specific highlight anchors as "the textbook states..."; address the common confusion from a diagnostic angle; end with "clinical pearl" — a one-liner that captures the key takeaway.`;
      }
      if (isMath) {
        return `MODE: Applied Scenario — math problem walk-through. ${gNote}
Generate 8–10 segments: present a real-world problem that uses the page concept; walk through setup → approach → step-by-step solution → interpretation; reference the key formula or theorem; address the common mistake; end with "the key insight is..." summarizing the principle.`;
      }
      if (subject === "physics" || subject === "engineering") {
        return `MODE: Applied Scenario — real-world physics/engineering scenario. ${gNote}
Generate 8–10 segments: present a concrete engineering or physics scenario (bridge, circuit, rocket, etc.) that requires the page concept; walk through the problem → principle → application → result; address the common confusion; end with "the practical takeaway is..." one-liner.`;
      }
      if (subject === "chemistry") {
        return `MODE: Lab/Reaction Scenario — applied chemistry case. ${gNote}
Generate 8–10 segments: present a lab or industrial scenario involving the reaction/mechanism on this page; walk through reactants → mechanism → products → real-world use; address the common confusion; end with a "remember this reaction by..." memory anchor.`;
      }
      if (subject === "biology") {
        return `MODE: Applied Scenario — organism or pathway scenario. ${gNote}
Generate 8–10 segments: present a biological scenario (organism behavior, disease, ecosystem, pathway) involving the page concept; walk through the mechanism, adaptive significance, and clinical/ecological relevance; address the common confusion; end with a key summary.`;
      }
      if (subject === "history") {
        return `MODE: Historical Case — event analysis scenario. ${gNote}
Generate 8–10 segments: present a historical case study that illustrates the page concept; walk through causes → events → consequences → significance; address a common historical misconception; end with "the lasting lesson is..." one-liner.`;
      }
      if (subject === "business") {
        return `MODE: Business Case — company or market scenario. ${gNote}
Generate 8–10 segments: present a real or hypothetical business scenario applying the page concept; walk through the problem → strategy → execution → outcome; address a common business misconception; end with "the strategic insight is..." one-liner.`;
      }
      return `MODE: Applied Scenario — real-world application of this concept. ${gNote}
Generate 8–10 segments: present a scenario that applies the page concept; walk through context → concept application → outcome; address the common confusion; end with a practical summary.`;
    }
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

export function buildPodcastPrompt(ctx: PodcastBuildContext, mode: PodcastMode): string {
  const { studyModel, pageText, noteLab, recallLab, pageNumber, bookId } = ctx;
  const sn = studyModel.studyNotes;
  const hasGuest = mode === "debate" || mode === "clinical" || mode === "quiz_podcast";

  const subject = detectSubjectType(pageText, studyModel);
  console.log("[PODCAST_SUBJECT_DETECTED]", { page: pageNumber, bookId, mode, subject });

  const pageSnippet = pageText.slice(0, 700).trim();
  const anchors = studyModel.visualAnchors.slice(0, 5);
  const concepts = studyModel.conceptBlocks.slice(0, 3);
  const noteLabSections = noteLab
    .flatMap((n) => (n.sections ?? []).slice(0, 2))
    .slice(0, 6);
  const recallCards = recallLab
    .flatMap((r) => r.cards.slice(0, 3))
    .slice(0, 6);

  const personas = (mode === "debate" || mode === "clinical") ? getPersonas(subject, mode) : null;

  const lines: string[] = [
    `=== PAGE ${pageNumber} CONTEXT ===`,
    `PAGE TEXT (excerpt):\n"${pageSnippet}"`,
    `SUBJECT DOMAIN: ${subject}`,
    "",
    `=== RIGHT PANEL finalStudyModel ===`,
    `Thesis: ${studyModel.pageThesis}`,
    `Why It Matters: ${sn.whyThisMatters ?? "—"}`,
    `Key Mechanism: ${sn.keyMechanism ?? "—"}`,
    `Common Confusion: ${sn.commonConfusion ?? "—"}`,
    `Memory Anchor: ${sn.quickMemory ?? "—"}`,
    `Exam Signal: ${sn.examSignal ?? "—"}`,
  ];

  if (personas) {
    lines.push(`HOST PERSONA: ${personas.host}`, `GUEST PERSONA: ${personas.guest}`);
  }

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
    "IMPORTANT: text must be pronunciable — spell out any formulas, abbreviations, or symbols in spoken form.",
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

export function parsePodcastResponse(
  raw: unknown,
  ctx: Pick<PodcastBuildContext, "pageNumber" | "bookId">,
  mode: PodcastMode,
): PodcastScript {
  const segments: PodcastSegment[] = [];
  let rawSegments: unknown[] = [];

  if (raw && typeof raw === "object" && "segments" in raw && Array.isArray((raw as any).segments)) {
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
    segments.push({
      id:           String(s.id ?? `seg-${i}`),
      type:         VALID_TYPES.has(s.type)    ? s.type    : "page_reading",
      speaker:      VALID_SPEAKERS.has(s.speaker) ? s.speaker : "host",
      text,
      sourceField:   s.sourceField   ? String(s.sourceField)   : undefined,
      anchorId:      s.anchorId      ? String(s.anchorId)      : undefined,
      recallCardId:  s.recallCardId  ? String(s.recallCardId)  : undefined,
      noteLabel:     s.noteLabel     ? String(s.noteLabel)     : undefined,
      externalTopic: s.externalTopic ? String(s.externalTopic) : undefined,
    });
  }

  const wordCount = segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
  return {
    mode,
    pageNumber: ctx.pageNumber,
    bookId:     ctx.bookId,
    segments,
    totalSegments: segments.length,
    estimatedMinutes: Math.max(1, Math.round(wordCount / 150)),
  };
}

// ---------------------------------------------------------------------------
// Local fallback
// ---------------------------------------------------------------------------

type PodcastSpeaker = "host" | "guest" | "narrator";

function seg(
  idx: number,
  type: PodcastSegment["type"],
  speaker: PodcastSpeaker,
  text: string,
  extra: Partial<PodcastSegment> = {},
): PodcastSegment {
  return { id: `local-${idx}`, type, speaker, text, ...extra };
}

export function buildLocalPodcastScript(ctx: PodcastBuildContext, mode: PodcastMode): PodcastScript {
  const { studyModel, recallLab, noteLab, pageNumber, bookId } = ctx;
  const sn = studyModel.studyNotes;
  const segments: PodcastSegment[] = [];
  let i = 0;

  const firstAnchor: VisualAnchor | undefined = studyModel.visualAnchors[0];
  const recallCards = recallLab.flatMap((r) => r.cards).slice(0, 3);
  const noteSection = noteLab.flatMap((n) => n.sections ?? []).slice(0, 2);

  segments.push(seg(i++, "intro", "host",
    `Welcome to page ${pageNumber}. Today we're covering: ${studyModel.pageThesis}.`));

  if (sn.whyThisMatters)
    segments.push(seg(i++, "right_panel_note", "host", `Why this matters: ${sn.whyThisMatters}`, { sourceField: "whyThisMatters" }));
  if (sn.keyMechanism)
    segments.push(seg(i++, "right_panel_note", "host", `Key mechanism: ${sn.keyMechanism}`, { sourceField: "keyMechanism" }));
  if (firstAnchor)
    segments.push(seg(i++, "highlight_evidence", "host", `The page states: "${firstAnchor.exactText}"`, { anchorId: firstAnchor.id }));
  if (sn.commonConfusion)
    segments.push(seg(i++, "right_panel_note", "host", `Common confusion: ${sn.commonConfusion}`, { sourceField: "commonConfusion" }));
  if (noteSection.length > 0)
    segments.push(seg(i++, "notelab_expansion", "host", `From your saved notes — ${noteSection[0].label}: ${noteSection[0].content.slice(0, 180)}`, { noteLabel: noteSection[0].label }));
  if (recallCards.length > 0 && (mode === "exam_cram" || mode === "quiz_podcast")) {
    segments.push(seg(i++, "recall_quiz", "host", `Quick question: ${recallCards[0].front}`, { recallCardId: recallCards[0].id }));
    segments.push(seg(i++, "recall_quiz", "host", `Answer: ${recallCards[0].back}`, { recallCardId: recallCards[0].id }));
  }
  if (sn.quickMemory)
    segments.push(seg(i++, "right_panel_note", "host", `Memory anchor: ${sn.quickMemory}`, { sourceField: "quickMemory" }));

  segments.push(seg(i++, "outro", "host",
    `That's page ${pageNumber}. Review your highlights, check NoteLab, and run RecallLab before moving on.`));

  const wordCount = segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
  console.log("[PODCAST_SCRIPT_CREATED]", { page: pageNumber, mode, source: "local-fallback", segments: segments.length });
  return { mode, pageNumber, bookId, segments, totalSegments: segments.length, estimatedMinutes: Math.max(1, Math.round(wordCount / 150)) };
}
