// lib/notelab/studySheetProfiles.ts
// Domain profiles for the Adaptive Study Sheet system.
// Each profile describes which sections to generate and how to prompt the AI.

export type ProfileId =
  | "dat"
  | "chemistry"
  | "biology"
  | "dental"
  | "math"
  | "law"
  | "history"
  | "cs"
  | "physics"
  | "nursing"
  | "general";

export interface SectionSpec {
  label: string;
  icon: string;
  required: boolean;
  description: string;
}

export interface StudySheetProfile {
  id: ProfileId;
  label: string;
  icon: string;
  sheetStyle: "exam-prep" | "reference" | "clinical" | "legal" | "analytical";
  documentType: string;
  sections: SectionSpec[];
  hasFormula: boolean;
  hasDiagram: boolean;
  hasPracticeQuestions: boolean;
  systemPromptAddendum: string;
}

export const STUDY_SHEET_PROFILES: Record<ProfileId, StudySheetProfile> = {
  dat: {
    id: "dat",
    label: "DAT / General Chemistry",
    icon: "🧪",
    sheetStyle: "exam-prep",
    documentType: "Exam Preparation",
    sections: [
      { label: "Key Facts",              icon: "⭐", required: true,  description: "3-6 high-yield bullets. Exactly what appears on the DAT. No fluff." },
      { label: "DAT Pearl",              icon: "💎", required: true,  description: "One insight exam writers hide in distractors. Not obvious. Specific." },
      { label: "Common Trap",            icon: "⚠️", required: true,  description: "The exact wrong answer students pick and why — be specific." },
      { label: "Mechanism",              icon: "⚙️", required: true,  description: "WHY the concept works — causal chain, not a description." },
      { label: "Step-by-Step Procedure", icon: "📋", required: false, description: "What a student DOES during the test to answer correctly." },
      { label: "Memory Hook",            icon: "🧠", required: true,  description: "A mnemonic, acronym, or story that sticks and is correct." },
      { label: "Mistakes Students Make", icon: "❌", required: true,  description: "Specific errors on this topic, not generic advice." },
      { label: "Expert Connections",     icon: "🔗", required: true,  description: "Real cross-subject connections: Gen Chem ↔ Biochem ↔ Bio ↔ Orgo." },
    ],
    hasFormula: true,
    hasDiagram: true,
    hasPracticeQuestions: true,
    systemPromptAddendum: `You are preparing a DAT student who needs to pass in 6 weeks. Every section must be exam-specific.
Pearl questions must include a trap answer. Formula must show all variables defined.
Worked example must be at actual DAT difficulty.`,
  },

  chemistry: {
    id: "chemistry",
    label: "Chemistry",
    icon: "⚗️",
    sheetStyle: "exam-prep",
    documentType: "Chemistry",
    sections: [
      { label: "Core Concept",          icon: "🎯", required: true,  description: "The governing principle in one sentence." },
      { label: "Mechanism",             icon: "⚙️", required: true,  description: "Step-by-step electron/atomic-level explanation of why it happens." },
      { label: "Reaction Conditions",   icon: "🌡️", required: false, description: "Reagents, temperature, catalyst, solvent — what enables the reaction." },
      { label: "Common Trap",           icon: "⚠️", required: true,  description: "The exact conceptual error students make. Be specific." },
      { label: "Memory Hook",           icon: "🧠", required: true,  description: "A mnemonic or story that sticks." },
      { label: "Mistakes Students Make",icon: "❌", required: true,  description: "Specific errors, not generic advice." },
      { label: "Expert Connections",    icon: "🔗", required: true,  description: "Connections to other chemistry topics, biology, physics." },
    ],
    hasFormula: true,
    hasDiagram: true,
    hasPracticeQuestions: true,
    systemPromptAddendum: `Emphasize mechanistic reasoning. Explain electron movement, bond breaking/forming.
If there are multiple mechanisms (SN1 vs SN2), address conditions for each.`,
  },

  biology: {
    id: "biology",
    label: "Biology",
    icon: "🧬",
    sheetStyle: "reference",
    documentType: "Biology",
    sections: [
      { label: "Core Concept",      icon: "🎯", required: true,  description: "The central biological principle in one sentence." },
      { label: "Structure",         icon: "🔬", required: false, description: "Physical components, anatomy, molecular composition." },
      { label: "Function",          icon: "⚡", required: true,  description: "What it does and why — the purpose." },
      { label: "Pathway / Process", icon: "🔄", required: false, description: "Step-by-step sequence of events or biochemical cascade." },
      { label: "Cause & Effect",    icon: "↔️", required: true,  description: "What triggers this process and what the consequences are." },
      { label: "High-Yield Fact",   icon: "⭐", required: true,  description: "The single most-tested fact about this concept." },
      { label: "Exception",         icon: "⚠️", required: false, description: "When the rule breaks down or a special case applies." },
      { label: "Memory Hook",       icon: "🧠", required: true,  description: "A mnemonic or analogy that sticks." },
      { label: "Expert Connections",icon: "🔗", required: true,  description: "Links to genetics, biochemistry, anatomy, physiology, evolution." },
    ],
    hasFormula: false,
    hasDiagram: true,
    hasPracticeQuestions: false,
    systemPromptAddendum: `Use systems-level thinking. Connect molecular mechanisms to physiological outcomes.
Emphasize evolutionary reasoning and clinical relevance where applicable.`,
  },

  dental: {
    id: "dental",
    label: "Dental / Clinical",
    icon: "🦷",
    sheetStyle: "clinical",
    documentType: "Dental/Medical",
    sections: [
      { label: "Clinical Significance", icon: "📌", required: true,  description: "Why this matters clinically — patient outcomes and risk." },
      { label: "Anatomy / Structure",   icon: "🦷", required: false, description: "Relevant anatomical structures and their relationships." },
      { label: "Procedure / Technique", icon: "⚙️", required: false, description: "Step-by-step clinical procedure or technique." },
      { label: "Decision Point",        icon: "🌳", required: true,  description: "Key clinical decisions — when to do X vs Y, how to triage." },
      { label: "Complication / Risk",   icon: "🚧", required: true,  description: "What can go wrong, how to prevent it, how to manage it." },
      { label: "Clinical Pearl",        icon: "💎", required: true,  description: "The insight a clinician learns from experience, not textbooks." },
      { label: "Patient Safety",        icon: "🔴", required: false, description: "Safety-critical considerations — contraindications, interactions." },
      { label: "Expert Connections",    icon: "🔗", required: true,  description: "Links to anatomy, pharmacology, radiology, systemic disease." },
    ],
    hasFormula: false,
    hasDiagram: true,
    hasPracticeQuestions: true,
    systemPromptAddendum: `Think like a clinician. Lead with patient impact.
Specify material choices, dosages, or timing where relevant.
Always note contraindications and failure modes.`,
  },

  math: {
    id: "math",
    label: "Mathematics",
    icon: "📐",
    sheetStyle: "reference",
    documentType: "Mathematics",
    sections: [
      { label: "Definition",          icon: "📖", required: true,  description: "Precise formal definition." },
      { label: "Derivation",          icon: "🔢", required: false, description: "How the formula or result is derived — key steps only." },
      { label: "Procedure",           icon: "📋", required: true,  description: "Step-by-step procedure for applying this concept." },
      { label: "Common Error",        icon: "❌", required: true,  description: "The exact algebraic or conceptual mistake students make." },
      { label: "Geometric Intuition", icon: "📊", required: false, description: "Visual or spatial interpretation of the concept." },
      { label: "Special Cases",       icon: "⚠️", required: false, description: "Boundary conditions, undefined cases, domain restrictions." },
      { label: "Expert Connections",  icon: "🔗", required: true,  description: "Connections to other math areas and physics applications." },
    ],
    hasFormula: true,
    hasDiagram: true,
    hasPracticeQuestions: true,
    systemPromptAddendum: `Show actual symbol manipulation, not just conceptual description.
Worked examples must show every algebraic step.
Flag common sign errors, domain errors, and order-of-operations mistakes explicitly.`,
  },

  law: {
    id: "law",
    label: "Law",
    icon: "⚖️",
    sheetStyle: "legal",
    documentType: "Law",
    sections: [
      { label: "Issue",            icon: "❓", required: true,  description: "The legal question this concept addresses." },
      { label: "Rule",             icon: "📜", required: true,  description: "The governing rule, statute, or doctrine — exact formulation." },
      { label: "Elements",         icon: "🔢", required: true,  description: "Each required element to establish the rule." },
      { label: "Exception",        icon: "⚠️", required: false, description: "When the rule does not apply or is displaced." },
      { label: "Holding",          icon: "⚖️", required: false, description: "Key case holding that established or refined the rule." },
      { label: "Application",      icon: "🔍", required: true,  description: "How to apply the rule in a typical fact pattern." },
      { label: "Counterargument",  icon: "↔️", required: false, description: "The strongest opposing argument and how to rebut it." },
      { label: "Policy Rationale", icon: "💡", required: false, description: "Why the law is structured this way — policy basis." },
      { label: "Expert Connections",icon: "🔗", required: true, description: "Links to related doctrines, remedies, procedural rules." },
    ],
    hasFormula: false,
    hasDiagram: false,
    hasPracticeQuestions: true,
    systemPromptAddendum: `Use IRAC structure. Be precise about jurisdiction-specific variation where it matters.
Elements must be numbered and individually addressable.
Counterarguments must name the strongest opposing doctrine.`,
  },

  history: {
    id: "history",
    label: "History",
    icon: "🏛️",
    sheetStyle: "analytical",
    documentType: "History",
    sections: [
      { label: "Central Claim",             icon: "🎯", required: true,  description: "The historian's main argument about this event or period." },
      { label: "Timeline",                  icon: "📅", required: true,  description: "Key dates and events in chronological sequence." },
      { label: "Causes",                    icon: "⬆️", required: true,  description: "Short-term and long-term causes — distinguish between them." },
      { label: "Turning Point",             icon: "↩️", required: false, description: "The moment that changed the course of events and why." },
      { label: "Consequences",              icon: "⬇️", required: true,  description: "Immediate and long-term consequences — political, social, economic." },
      { label: "Key Figures",               icon: "👤", required: false, description: "Who shaped this event — roles, motivations, decisions." },
      { label: "Competing Interpretation",  icon: "↔️", required: false, description: "How different historians interpret this event differently." },
      { label: "Primary Evidence",          icon: "📜", required: false, description: "Key primary sources and what they reveal." },
      { label: "Expert Connections",        icon: "🔗", required: true,  description: "Links to other periods, geographic regions, and themes." },
    ],
    hasFormula: false,
    hasDiagram: true,
    hasPracticeQuestions: false,
    systemPromptAddendum: `Distinguish primary from secondary sources. Use historical periodization.
Show causation, not just correlation. Note what historians debate.
Identify the specific argument, not just the topic.`,
  },

  cs: {
    id: "cs",
    label: "Computer Science",
    icon: "💻",
    sheetStyle: "reference",
    documentType: "Computer Science",
    sections: [
      { label: "Core Concept",      icon: "🎯", required: true,  description: "What this concept is and why it exists." },
      { label: "Algorithm / Logic", icon: "🔄", required: false, description: "How it works — pseudocode-level logic." },
      { label: "Complexity",        icon: "⚡", required: false, description: "Time and space complexity with reasoning — WHY, not just O(n)." },
      { label: "When to Use",       icon: "📋", required: true,  description: "The problem class it solves and decision criteria for choosing it." },
      { label: "Common Pitfall",    icon: "⚠️", required: true,  description: "The implementation or conceptual error students make." },
      { label: "Tradeoffs",         icon: "↔️", required: true,  description: "Pros and cons vs. alternatives — real technical tradeoffs." },
      { label: "Memory Hook",       icon: "🧠", required: true,  description: "An analogy or mental model that makes this stick." },
      { label: "Expert Connections",icon: "🔗", required: true,  description: "Related data structures, algorithms, design patterns, system concepts." },
    ],
    hasFormula: true,
    hasDiagram: true,
    hasPracticeQuestions: false,
    systemPromptAddendum: `Show concrete code or pseudocode examples where helpful.
Complexity analysis must explain WHY. Distinguish best/average/worst case where relevant.`,
  },

  physics: {
    id: "physics",
    label: "Physics",
    icon: "⚛️",
    sheetStyle: "reference",
    documentType: "Physics",
    sections: [
      { label: "Core Concept",        icon: "🎯", required: true,  description: "The physical principle in one sentence." },
      { label: "Physical Intuition",  icon: "💡", required: true,  description: "Why does nature behave this way? The physical reasoning." },
      { label: "Derivation Sketch",   icon: "📝", required: false, description: "Key steps in deriving the result — essential logic, not full proof." },
      { label: "Procedure",           icon: "📋", required: true,  description: "How to solve a problem of this type — step by step." },
      { label: "Common Trap",         icon: "⚠️", required: true,  description: "The exact conceptual or algebraic error students make." },
      { label: "Real-World Example",  icon: "🌍", required: false, description: "A concrete physical situation where this concept appears." },
      { label: "Expert Connections",  icon: "🔗", required: true,  description: "Links to other physics topics, mathematics, engineering applications." },
    ],
    hasFormula: true,
    hasDiagram: true,
    hasPracticeQuestions: true,
    systemPromptAddendum: `Emphasize dimensional analysis. Show units throughout.
Physical intuition must precede math, not follow it.
Common trap should be a specific sign error or wrong variable substitution.`,
  },

  nursing: {
    id: "nursing",
    label: "Nursing / Pharmacology",
    icon: "💊",
    sheetStyle: "clinical",
    documentType: "Nursing/Pharmacology",
    sections: [
      { label: "Clinical Relevance",      icon: "📌", required: true,  description: "Why this matters for patient care — clinical significance." },
      { label: "Mechanism of Action",     icon: "⚙️", required: false, description: "How a drug or intervention works at the physiological level." },
      { label: "Assessment",              icon: "🔍", required: false, description: "What to assess before, during, after — vitals, labs, symptoms." },
      { label: "Nursing Intervention",    icon: "💉", required: true,  description: "The priority nursing action and rationale." },
      { label: "Patient Education",       icon: "📚", required: false, description: "What to teach the patient — key safety points." },
      { label: "Side Effects / Toxicity", icon: "⚠️", required: true,  description: "Most dangerous or common adverse effects — priority monitoring." },
      { label: "Contraindications",       icon: "🔴", required: true,  description: "When NOT to use — absolute and relative contraindications." },
      { label: "NCLEX Tip",              icon: "💎", required: false, description: "The NCLEX-style thinking this concept tests." },
      { label: "Expert Connections",      icon: "🔗", required: true,  description: "Links to related conditions, medications, lab values." },
    ],
    hasFormula: false,
    hasDiagram: true,
    hasPracticeQuestions: true,
    systemPromptAddendum: `Use the nursing process (ADPIE) framework where applicable.
Priority interventions must come first. Safety-critical points must be explicit.
Include both generic and brand drug names.`,
  },

  general: {
    id: "general",
    label: "General Study",
    icon: "📝",
    sheetStyle: "reference",
    documentType: "General Study",
    sections: [
      { label: "Core Idea",               icon: "🎯", required: true,  description: "The central idea in one sentence." },
      { label: "Key Points",              icon: "⭐", required: true,  description: "3-6 most important facts or principles." },
      { label: "Context",                 icon: "🌐", required: true,  description: "Why this matters — broader significance." },
      { label: "Common Misunderstanding", icon: "⚠️", required: false, description: "What people get wrong about this." },
      { label: "Memory Hook",             icon: "🧠", required: false, description: "A mnemonic or analogy that aids retention." },
      { label: "Expert Connections",      icon: "🔗", required: false, description: "Links to related concepts in this or other fields." },
    ],
    hasFormula: false,
    hasDiagram: false,
    hasPracticeQuestions: false,
    systemPromptAddendum: "",
  },
};

// ── Profile detection ─────────────────────────────────────────────────────

export interface ProfileDetection {
  profileId:  ProfileId;
  confidence: number;   // 0–1
  signal:     string;   // human-readable description of what matched
}

/** Map a raw subject/domain string to the best matching profile with confidence. */
export function profileFromSubject(subject: string): ProfileDetection {
  const s = subject.toLowerCase();
  if (/\bdat\b|dental admission test/.test(s))
    return { profileId: "dat",       confidence: 0.95, signal: "matched DAT keyword" };
  if (/\blaw\b|legal|contract|tort|constitutional|criminal/.test(s))
    return { profileId: "law",       confidence: 0.90, signal: "matched law/legal keyword" };
  if (/dental|dent|prostho|endo|perio|oral surg/.test(s))
    return { profileId: "dental",    confidence: 0.90, signal: "matched dental keyword" };
  if (/nursing|nclex|pharma/.test(s))
    return { profileId: "nursing",   confidence: 0.88, signal: "matched nursing/pharma keyword" };
  if (/chem(istry)?|organic|biochem/.test(s))
    return { profileId: "chemistry", confidence: 0.85, signal: "matched chemistry keyword" };
  if (/bio(logy)?|anatomy|physiology|genetics|cell|organism|microbio/.test(s))
    return { profileId: "biology",   confidence: 0.85, signal: "matched biology keyword" };
  if (/physics|mechanics|thermodynamic|electromagnet|quantum/.test(s))
    return { profileId: "physics",   confidence: 0.85, signal: "matched physics keyword" };
  if (/calc|math|algebra|geometry|trig|statistic|differential|linear|analysis/.test(s))
    return { profileId: "math",      confidence: 0.82, signal: "matched math keyword" };
  if (/computer science|programming|algorithm|software|coding|data structure/.test(s))
    return { profileId: "cs",        confidence: 0.88, signal: "matched CS keyword" };
  if (/histor|war|revolution|empire|century|ancient|medieval/.test(s))
    return { profileId: "history",   confidence: 0.80, signal: "matched history keyword" };
  return { profileId: "general", confidence: 0.30, signal: "no domain keywords found" };
}

/** Accent color for each profile — used in UI badges. */
export const PROFILE_ACCENT: Record<ProfileId, string> = {
  dat:      "#c4b5fd",
  chemistry:"#38bdf8",
  biology:  "#34d399",
  dental:   "#22d3ee",
  math:     "#fbbf24",
  law:      "#94a3b8",
  history:  "#fb923c",
  cs:       "#6ee7b7",
  physics:  "#f472b6",
  nursing:  "#f87171",
  general:  "#94a3b8",
};
