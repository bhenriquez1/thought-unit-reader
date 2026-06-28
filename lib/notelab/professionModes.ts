// lib/notelab/professionModes.ts
// Profession-mode lenses — relabel the same underlying note content with
// profession-specific framing (Surgeon / Pilot / Dental). Pure presentation:
// no new AI content, just alternate labels/icons for existing sections.

export type ProfessionMode = "default" | "surgeon" | "pilot" | "dental";

export const PROFESSION_MODES: Array<{ id: ProfessionMode; label: string; icon: string }> = [
  { id: "default", label: "Default", icon: "📝" },
  { id: "surgeon", label: "Surgeon Mode", icon: "🔬" },
  { id: "pilot",   label: "Pilot Mode",   icon: "✈️" },
  { id: "dental",  label: "Dental Mode",  icon: "🦷" },
];

const STORAGE_KEY = "notelab_profession_mode";

export function getStoredProfessionMode(): ProfessionMode {
  if (typeof window === "undefined") return "default";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && PROFESSION_MODES.some((m) => m.id === raw)) return raw as ProfessionMode;
  } catch { /* ignore */ }
  return "default";
}

export function setStoredProfessionMode(mode: ProfessionMode): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
}

interface LensEntry { label: string; icon: string }

// New-schema section labels (Core Idea, Must Know, Mechanism, DAT/Dental Trap, Memory Hook, Recall Questions, Source)
const SECTION_LENS: Record<string, Record<ProfessionMode, LensEntry>> = {
  "Core Idea": {
    default: { label: "Core Idea",        icon: "🎯" },
    surgeon: { label: "Procedure Overview", icon: "🩺" },
    pilot:   { label: "Flight Briefing",  icon: "🧭" },
    dental:  { label: "Clinical Concept", icon: "🦷" },
  },
  "Must Know": {
    default: { label: "Must Know",          icon: "📌" },
    surgeon: { label: "Critical Steps",     icon: "🔪" },
    pilot:   { label: "Checklist Items",    icon: "✅" },
    dental:  { label: "Key Clinical Points", icon: "📌" },
  },
  "Mechanism": {
    default: { label: "Mechanism",     icon: "⚙️" },
    surgeon: { label: "Procedure Flow", icon: "⚙️" },
    pilot:   { label: "Flight Sequence", icon: "✈️" },
    dental:  { label: "Procedure Flow", icon: "⚙️" },
  },
  "DAT/Dental Trap": {
    default: { label: "DAT/Dental Trap",   icon: "⚠️" },
    surgeon: { label: "Complication Risk", icon: "⚠️" },
    pilot:   { label: "Hazard / Caution",  icon: "🚨" },
    dental:  { label: "Dental Trap",       icon: "⚠️" },
  },
  "Memory Hook": {
    default: { label: "Memory Hook",     icon: "🧠" },
    surgeon: { label: "Surgical Pearl",  icon: "💎" },
    pilot:   { label: "Pilot's Mnemonic", icon: "🧠" },
    dental:  { label: "Clinical Pearl",  icon: "💎" },
  },
  "Recall Questions": {
    default: { label: "Recall Questions",       icon: "📝" },
    surgeon: { label: "Case Review Questions",  icon: "📋" },
    pilot:   { label: "Oral Exam Questions",    icon: "🎙️" },
    dental:  { label: "Board Review Questions", icon: "📝" },
  },
  "Source": {
    default: { label: "Source", icon: "📖" },
    surgeon: { label: "Source", icon: "📖" },
    pilot:   { label: "Source", icon: "📖" },
    dental:  { label: "Source", icon: "📖" },
  },
  // Level 2 — deeper reasoning sections
  "Clinical Reasoning": {
    default: { label: "Clinical Reasoning",   icon: "🧩" },
    surgeon: { label: "Intraoperative Reasoning", icon: "🧩" },
    pilot:   { label: "In-Flight Decision Logic", icon: "🧩" },
    dental:  { label: "Clinical Reasoning",   icon: "🧩" },
  },
  "Common Mistake": {
    default: { label: "Common Mistake",     icon: "❌" },
    surgeon: { label: "Common Procedural Error", icon: "❌" },
    pilot:   { label: "Common Pilot Mistake", icon: "❌" },
    dental:  { label: "Common Mistake",     icon: "❌" },
  },
  "Exam Strategy": {
    default: { label: "Exam Strategy",   icon: "🎯" },
    surgeon: { label: "Board Exam Strategy", icon: "🎯" },
    pilot:   { label: "Checkride Strategy", icon: "🎯" },
    dental:  { label: "Board Exam Strategy", icon: "🎯" },
  },
  "Connection Map": {
    default: { label: "Connection Map",   icon: "🔗" },
    surgeon: { label: "Cross-System Link", icon: "🔗" },
    pilot:   { label: "Cross-System Link", icon: "🔗" },
    dental:  { label: "Connection Map",   icon: "🔗" },
  },
  "Clinical Pearl": {
    default: { label: "Clinical Pearl",   icon: "💎" },
    surgeon: { label: "Surgical Pearl",   icon: "💎" },
    pilot:   { label: "Pilot's Pearl",    icon: "💎" },
    dental:  { label: "Clinical Pearl",   icon: "💎" },
  },
  // Adaptive Notebook card-type labels (lib/notelab/noteCardStyle.ts) not already
  // covered above by an equivalently-named legacy section.
  "Trap": {
    default: { label: "Trap",              icon: "⚠️" },
    surgeon: { label: "Complication Risk", icon: "⚠️" },
    pilot:   { label: "Hazard / Caution",  icon: "🚨" },
    dental:  { label: "Dental Trap",       icon: "⚠️" },
  },
  "Procedure Flow": {
    default: { label: "Procedure Flow",  icon: "🪜" },
    surgeon: { label: "Operative Steps", icon: "🪜" },
    pilot:   { label: "Flight Sequence", icon: "✈️" },
    dental:  { label: "Procedure Flow",  icon: "🪜" },
  },
  "Expert Thinking": {
    default: { label: "Expert Thinking",   icon: "🧭" },
    surgeon: { label: "Surgeon's Approach", icon: "🧭" },
    pilot:   { label: "Captain's Approach", icon: "🧭" },
    dental:  { label: "Clinician's Approach", icon: "🧭" },
  },
  "Why This Matters": {
    default: { label: "Why This Matters",          icon: "💡" },
    surgeon: { label: "Why This Matters Clinically", icon: "💡" },
    pilot:   { label: "Why This Matters in Flight",  icon: "💡" },
    dental:  { label: "Why This Matters Clinically", icon: "💡" },
  },
  "Pattern Recognition": {
    default: { label: "Pattern Recognition", icon: "🧩" },
    surgeon: { label: "Pattern Recognition", icon: "🧩" },
    pilot:   { label: "Pattern Recognition", icon: "🧩" },
    dental:  { label: "Pattern Recognition", icon: "🧩" },
  },
  "Decision Tree": {
    default: { label: "Decision Tree",   icon: "🌳" },
    surgeon: { label: "Operative Decision Tree", icon: "🌳" },
    pilot:   { label: "Go/No-Go Decision Tree", icon: "🌳" },
    dental:  { label: "Clinical Decision Tree", icon: "🌳" },
  },
  // Surgeon-notes NoteLab schema (lib/notelab/ultraNoteStore.ts buildNoteFromStudyModel)
  "Chief Concern / Problem": {
    default: { label: "Chief Concern / Problem", icon: "🎯" },
    surgeon: { label: "Chief Complaint",          icon: "🩺" },
    pilot:   { label: "Mission Brief",            icon: "🧭" },
    dental:  { label: "Chief Complaint",          icon: "🦷" },
  },
  "Why This Matters Clinically": {
    default: { label: "Why This Matters Clinically",  icon: "💡" },
    surgeon: { label: "Why This Matters Clinically",  icon: "💡" },
    pilot:   { label: "Why This Matters Operationally", icon: "💡" },
    dental:  { label: "Why This Matters Clinically",  icon: "💡" },
  },
  "Diagnostic Reasoning": {
    default: { label: "Diagnostic Reasoning",     icon: "🧩" },
    surgeon: { label: "Preoperative Reasoning",   icon: "🧩" },
    pilot:   { label: "In-Flight Diagnostic Reasoning", icon: "🧩" },
    dental:  { label: "Diagnostic Reasoning",     icon: "🧩" },
  },
  "Procedure Logic": {
    default: { label: "Procedure Logic",  icon: "⚙️" },
    surgeon: { label: "Operative Logic",  icon: "⚙️" },
    pilot:   { label: "Flight Procedure Logic", icon: "✈️" },
    dental:  { label: "Procedure Logic",  icon: "⚙️" },
  },
  "Danger Zone": {
    default: { label: "Danger Zone",  icon: "⚠️" },
    surgeon: { label: "Danger Zone",  icon: "⚠️" },
    pilot:   { label: "Hazard Zone",  icon: "🚨" },
    dental:  { label: "Danger Zone",  icon: "⚠️" },
  },
  "Complication Risk": {
    default: { label: "Complication Risk", icon: "🚧" },
    surgeon: { label: "Complication Risk", icon: "🚧" },
    pilot:   { label: "Risk Factors",      icon: "🚧" },
    dental:  { label: "Complication Risk", icon: "🚧" },
  },
  "Case-Style Recall Questions": {
    default: { label: "Case-Style Recall Questions", icon: "📝" },
    surgeon: { label: "Case Review Questions",        icon: "📋" },
    pilot:   { label: "Oral Exam Questions",          icon: "🎙️" },
    dental:  { label: "Board Review Questions",       icon: "📝" },
  },
  "Visual Mnemonic": {
    default: { label: "Visual Mnemonic", icon: "🖼️" },
    surgeon: { label: "Visual Mnemonic", icon: "🖼️" },
    pilot:   { label: "Visual Mnemonic", icon: "🖼️" },
    dental:  { label: "Visual Mnemonic", icon: "🖼️" },
  },
  "Formula Breakdown": {
    default: { label: "Formula Breakdown", icon: "🧮" },
    surgeon: { label: "Formula Breakdown", icon: "🧮" },
    pilot:   { label: "Formula Breakdown", icon: "🧮" },
    dental:  { label: "Formula Breakdown", icon: "🧮" },
  },
  "Diagram": {
    default: { label: "Diagram", icon: "📐" },
    surgeon: { label: "Diagram", icon: "📐" },
    pilot:   { label: "Diagram", icon: "📐" },
    dental:  { label: "Diagram", icon: "📐" },
  },
  "Master Concepts": {
    default: { label: "Master Concepts",      icon: "🏛️" },
    surgeon: { label: "Foundational Anatomy", icon: "🏛️" },
    pilot:   { label: "Foundational Systems", icon: "🏛️" },
    dental:  { label: "Foundational Concepts", icon: "🏛️" },
  },
  "Worked Example": {
    default: { label: "Worked Example",   icon: "✏️" },
    surgeon: { label: "Case Walkthrough", icon: "✏️" },
    pilot:   { label: "Scenario Walkthrough", icon: "✏️" },
    dental:  { label: "Case Walkthrough", icon: "✏️" },
  },
  "Case Challenge": {
    default: { label: "Case Challenge",  icon: "📋" },
    surgeon: { label: "Case Challenge",  icon: "📋" },
    pilot:   { label: "Scenario Challenge", icon: "📋" },
    dental:  { label: "Case Challenge",  icon: "📋" },
  },
  "Quick Review": {
    default: { label: "Quick Review",  icon: "⏱️" },
    surgeon: { label: "Quick Review",  icon: "⏱️" },
    pilot:   { label: "Quick Review",  icon: "⏱️" },
    dental:  { label: "Quick Review",  icon: "⏱️" },
  },
};

export function getSectionLens(mode: ProfessionMode, genericLabel: string): LensEntry | null {
  const entry = SECTION_LENS[genericLabel];
  if (!entry) return null;
  return entry[mode] ?? entry.default;
}

// Legacy professorNotes fields
const PROFESSOR_LENS: Record<string, Record<ProfessionMode, string>> = {
  whyItMatters: {
    default: "Why This Matters",
    surgeon: "Why This Matters Clinically",
    pilot:   "Why This Matters in Flight",
    dental:  "Why This Matters Clinically",
  },
  keyMechanism: {
    default: "Key Mechanism",
    surgeon: "Key Surgical Mechanism",
    pilot:   "Key Flight Mechanism",
    dental:  "Key Mechanism",
  },
  commonConfusion: {
    default: "Common Confusion",
    surgeon: "Common Complication",
    pilot:   "Common Pilot Error",
    dental:  "Common Confusion",
  },
  memoryAnchor: {
    default: "Memory Hook",
    surgeon: "Surgical Pearl",
    pilot:   "Cockpit Mnemonic",
    dental:  "Clinical Pearl",
  },
  reasoningFlow: {
    default: "Reasoning Flow",
    surgeon: "Clinical Reasoning Flow",
    pilot:   "Decision Flow",
    dental:  "Clinical Reasoning Flow",
  },
  examSignal: {
    default: "Exam Signal",
    surgeon: "Board Exam Signal",
    pilot:   "Checkride Signal",
    dental:  "Board Exam Signal",
  },
};

export function getProfessorFieldLabel(mode: ProfessionMode, field: keyof typeof PROFESSOR_LENS): string {
  const entry = PROFESSOR_LENS[field];
  return entry[mode] ?? entry.default;
}

// Legacy concept fields
const CONCEPT_LENS: Record<string, Record<ProfessionMode, string>> = {
  pattern: {
    default: "Pattern",
    surgeon: "Technique",
    pilot:   "Procedure",
    dental:  "Pattern",
  },
  surgicalReason: {
    default: "Why it works",
    surgeon: "Surgical Rationale",
    pilot:   "Why It Works",
    dental:  "Why it works",
  },
  trap: {
    default: "Common trap",
    surgeon: "Complication Risk",
    pilot:   "Hazard",
    dental:  "Common trap",
  },
  rule: {
    default: "Rule / Memory",
    surgeon: "Surgical Rule",
    pilot:   "Flight Rule",
    dental:  "Clinical Rule",
  },
};

export function getConceptFieldLabel(mode: ProfessionMode, field: keyof typeof CONCEPT_LENS): string {
  const entry = CONCEPT_LENS[field];
  return entry[mode] ?? entry.default;
}
