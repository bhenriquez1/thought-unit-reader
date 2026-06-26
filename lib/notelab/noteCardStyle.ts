// lib/notelab/noteCardStyle.ts
// Per-card-type visual identity for the Adaptive Notebook grid — icon, label,
// accent color, and a bare "r,g,b" glow triplet consumed by tierGlowStyle().

import type { NoteCardType } from "@/lib/insights/synthesizeTeachingOutput";

export interface NoteCardStyleEntry {
  icon: string;
  label: string;
  accent: string;
  glowColor: string;
}

export const NOTE_CARD_STYLE: Record<NoteCardType, NoteCardStyleEntry> = {
  must_know: {
    icon: "🎯", label: "Must Know",
    accent: "#fde047", glowColor: "253,224,71",
  },
  mechanism: {
    icon: "⚙️", label: "Mechanism",
    accent: "#86efac", glowColor: "134,239,172",
  },
  clinical_reasoning: {
    icon: "🧠", label: "Clinical Reasoning",
    accent: "#c4b5fd", glowColor: "196,181,253",
  },
  dat_trap: {
    icon: "⚠️", label: "Trap",
    accent: "#fca5a5", glowColor: "252,165,165",
  },
  common_mistake: {
    icon: "❗", label: "Common Mistake",
    accent: "#fdba74", glowColor: "253,186,116",
  },
  memory_hook: {
    icon: "🪝", label: "Memory Hook",
    accent: "#67e8f9", glowColor: "103,232,249",
  },
  connection_map: {
    icon: "🔗", label: "Connection Map",
    accent: "#93c5fd", glowColor: "147,197,253",
  },
  procedure_flow: {
    icon: "🪜", label: "Procedure Flow",
    accent: "#a7f3d0", glowColor: "167,243,208",
  },
  clinical_pearl: {
    icon: "💎", label: "Clinical Pearl",
    accent: "#f0abfc", glowColor: "240,171,252",
  },
  expert_thinking: {
    icon: "🧭", label: "Expert Thinking",
    accent: "#fbcfe8", glowColor: "251,207,232",
  },
  why_this_matters: {
    icon: "💡", label: "Why This Matters",
    accent: "#fef08a", glowColor: "254,240,138",
  },
  pattern_recognition: {
    icon: "🧩", label: "Pattern Recognition",
    accent: "#bef264", glowColor: "190,242,100",
  },
  decision_tree: {
    icon: "🌳", label: "Decision Tree",
    accent: "#5eead4", glowColor: "94,234,212",
  },
  visual_mnemonic: {
    icon: "🖼️", label: "Visual Mnemonic",
    accent: "#c7d2fe", glowColor: "199,210,254",
  },
  formula_breakdown: {
    icon: "🧮", label: "Formula Breakdown",
    accent: "#a5b4fc", glowColor: "165,180,252",
  },
  diagram: {
    icon: "📐", label: "Diagram",
    accent: "#7dd3fc", glowColor: "125,211,252",
  },
  recall_questions: {
    icon: "📝", label: "Recall Questions",
    accent: "#d9f99d", glowColor: "217,249,157",
  },
  exam_strategy: {
    icon: "🎓", label: "Exam Strategy",
    accent: "#fcd34d", glowColor: "252,211,77",
  },
  surgeon_lens: {
    icon: "🩺", label: "Surgeon Lens",
    accent: "#fb7185", glowColor: "251,113,133",
  },
  other: {
    icon: "•", label: "Note",
    accent: "#d4d4d8", glowColor: "212,212,216",
  },
};
