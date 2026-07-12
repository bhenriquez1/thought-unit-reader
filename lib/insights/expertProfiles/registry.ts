// lib/insights/expertProfiles/registry.ts
//
// Single source of truth for per-domain ExpertProfileExtension data.
// DomainPreset data (kindGroups, kindLabels, detection) stays in domainPresets.ts.
// getExpertProfile() merges the two into a full ExpertProfile.
//
// To add a new subject:
//   1. Add a DomainPreset entry to DOMAIN_PRESETS in domainPresets.ts.
//   2. Add an ExpertProfileExtension entry to PROFILE_EXTENSIONS below.

import {
  getDomainPreset,
  DOMAIN_PRESETS,
  UNIVERSAL_PRESET,
} from "@/lib/insights/domainPresets";
import type {
  ExpertProfile,
  ExpertProfileExtension,
} from "@/lib/insights/expertProfiles/types";

// ─── Per-preset extension data ───────────────────────────────────────────────

const PROFILE_EXTENSIONS: Record<string, ExpertProfileExtension> = {

  // ── Universal fallback ────────────────────────────────────────────────────
  universal: {
    speech: {
      introStyle: "analytical",
      guidedPrefixByKind: {
        thesis:      "Key concept: ",
        trap:        "Watch out for this: ",
        mechanism:   "The process is: ",
        dat_fact:    "Important: ",
        definition:  "Key concept: ",
      },
      focusKinds:    ["thesis", "definition"],
      essentialKinds: ["thesis", "definition", "mechanism", "trap"],
    },
    studyNotes: {
      fieldLabels: {},
      templateHints: {
        "Why This Matters": "Explain the practical significance of this concept.",
        "Key Mechanism":    "Describe the underlying process or causal chain.",
      },
      preferredLayouts: ["concept_map", "flowchart"],
    },
    recall: {
      templates: [
        "What is the main concept of [topic]?",
        "Why does [concept] matter?",
        "What is the most common mistake with [concept]?",
      ],
      preferredQuestionTypes: ["conceptual", "application"],
    },
    whiteboard: { preferredStyle: "concept_map" },
    expertBrain: {
      persona: "You are a world-class expert educator. Explain the material using evidence from the source page and the governing principle. Ground every selected anchor in exact source text. Do not invent facts beyond what the source states.",
      reasoningPriorities: ["governing principle", "underlying mechanism", "significance", "common misconception"],
      explanationStyle: "analytical",
    },
  },

  // ── Dental School ─────────────────────────────────────────────────────────
  dental_school: {
    speech: {
      introStyle: "clinical",
      guidedPrefixByKind: {
        thesis:      "The diagnosis here is: ",
        mechanism:   "Treatment step: ",
        trap:        "Watch out — complication: ",
        dat_fact:    "Clinical pearl: ",
        clinical:    "Clinical pearl: ",
        definition:  "Material: ",
      },
      focusKinds:    ["thesis", "trap"],
      essentialKinds: ["thesis", "mechanism", "trap", "dat_fact", "clinical"],
    },
    studyNotes: {
      fieldLabels: {
        "Why This Matters": "Clinical Significance",
        "Key Mechanism":    "Pathophysiology",
        "Common Confusion": "Common Clinical Error",
        "Quick Memory":     "Clinical Mnemonic",
      },
      templateHints: {
        "Why This Matters": "Focus on patient outcome and clinical significance.",
        "Key Mechanism":    "Explain the pathophysiological mechanism.",
      },
      preferredLayouts: ["procedure_flow", "decision_tree"],
    },
    recall: {
      templates: [
        "What is the diagnosis when you see [sign/symptom]?",
        "What is the next step when [condition] is present?",
        "What is the most serious complication of [procedure]?",
      ],
      preferredQuestionTypes: ["clinical_case", "procedure", "complication"],
    },
    whiteboard: { preferredStyle: "flowchart" },
    expertBrain: {
      persona: "You are an expert dental educator with deep clinical experience. Explain the material using evidence from the source page, emphasizing diagnosis, treatment protocols, and patient safety. Do not invent clinical facts, patient information, or outcomes beyond what the source states.",
      reasoningPriorities: ["diagnosis first", "treatment steps in order", "complications and contraindications", "clinical pearls"],
      explanationStyle: "clinical-sequential",
    },
  },

  // ── Medical / Surgical ───────────────────────────────────────────────────
  medical_surgical: {
    speech: {
      introStyle: "clinical",
      guidedPrefixByKind: {
        thesis:      "Master this: ",
        mechanism:   "Procedure step: ",
        trap:        "Danger zone: ",
        dat_fact:    "Clinical pearl: ",
        clinical:    "Clinical pearl: ",
      },
      focusKinds:    ["thesis", "trap"],
      essentialKinds: ["thesis", "mechanism", "trap", "dat_fact", "clinical"],
    },
    studyNotes: {
      fieldLabels: {
        "Why This Matters": "Clinical Significance",
        "Key Mechanism":    "Pathophysiology",
        "Common Confusion": "Surgical Pitfall",
        "Quick Memory":     "Clinical Mnemonic",
      },
      templateHints: {
        "Why This Matters": "Focus on patient outcome and clinical significance.",
        "Key Mechanism":    "Explain the surgical or pathophysiological mechanism.",
      },
      preferredLayouts: ["procedure_flow", "decision_tree"],
    },
    recall: {
      templates: [
        "What is the indication for [procedure]?",
        "What is the most serious complication of [intervention]?",
        "What is the next step when [clinical finding] is present?",
      ],
      preferredQuestionTypes: ["clinical_case", "procedure", "decision"],
    },
    whiteboard: { preferredStyle: "flowchart" },
    expertBrain: {
      persona: "You are an expert medical educator in surgery and clinical medicine. Explain the material using evidence from the source page, emphasizing clinical reasoning, surgical indications, and patient safety. Do not invent clinical facts, patient information, or outcomes beyond what the source states.",
      reasoningPriorities: ["finding → pathophysiology → consequence", "surgical indications", "contraindications", "complications to avoid"],
      explanationStyle: "clinical-causal",
    },
  },

  // ── Nursing / Pharmacology ───────────────────────────────────────────────
  nursing_pharmacology: {
    speech: {
      introStyle: "clinical",
      guidedPrefixByKind: {
        thesis:    "Key concept: ",
        mechanism: "Mechanism of action: ",
        trap:      "Nursing alert: ",
        clinical:  "Patient care note: ",
        dat_fact:  "Key fact: ",
      },
      focusKinds:    ["thesis", "trap"],
      essentialKinds: ["thesis", "mechanism", "trap", "clinical"],
    },
    studyNotes: {
      fieldLabels: {
        "Why This Matters": "Clinical Significance",
        "Key Mechanism":    "Mechanism of Action",
        "Common Confusion": "Nursing Alert",
        "Quick Memory":     "Clinical Hook",
      },
      templateHints: {
        "Why This Matters": "Explain the patient care significance.",
        "Key Mechanism":    "Describe the pharmacological mechanism of action.",
      },
      preferredLayouts: ["procedure_flow", "decision_tree"],
    },
    recall: {
      templates: [
        "What is the mechanism of action of [drug]?",
        "What is the nursing priority when [clinical situation]?",
        "What are the contraindications for [drug/intervention]?",
      ],
      preferredQuestionTypes: ["mechanism", "clinical_priority", "contraindication"],
    },
    whiteboard: { preferredStyle: "flowchart" },
    expertBrain: {
      persona: "You are an expert nursing and pharmacology educator. Explain the material using evidence from the source page, emphasizing patient safety, drug mechanisms, and clinical priorities. Do not invent drug interactions, dosages, or patient outcomes beyond what the source states.",
      reasoningPriorities: ["patient safety first", "drug mechanism", "nursing priorities", "contraindications"],
      explanationStyle: "clinical-safety-focused",
    },
  },

  // ── DAT ──────────────────────────────────────────────────────────────────
  dat: {
    speech: {
      introStyle: "analytical",
      guidedPrefixByKind: {
        thesis:    "High-yield concept: ",
        trap:      "DAT trap: ",
        dat_fact:  "Must know: ",
        mechanism: "Mechanism: ",
      },
      focusKinds:    ["thesis", "dat_fact"],
      essentialKinds: ["thesis", "dat_fact", "trap", "mechanism"],
    },
    studyNotes: {
      fieldLabels: {
        "Why This Matters": "DAT Relevance",
        "Key Mechanism":    "Mechanism",
        "Common Confusion": "Common Trap",
        "Quick Memory":     "Quick Hook",
      },
      templateHints: {
        "Why This Matters": "Explain why this appears on the DAT.",
        "Key Mechanism":    "Explain the mechanism the DAT tests.",
      },
      preferredLayouts: ["concept_map", "flowchart"],
    },
    recall: {
      templates: [
        "What is the high-yield fact about [concept]?",
        "What trap do students fall into with [topic]?",
        "What is the mechanism behind [DAT-tested concept]?",
      ],
      preferredQuestionTypes: ["high_yield", "trap", "mechanism"],
    },
    whiteboard: { preferredStyle: "concept_map" },
    expertBrain: {
      persona: "You are an expert DAT tutor focused on high-yield biology, chemistry, and perceptual ability content. Explain the material using evidence from the source page, emphasizing what is most tested and the traps students encounter. Do not invent test content beyond what the source states.",
      reasoningPriorities: ["high-yield first", "common traps", "mechanisms briefly", "mnemonics if helpful"],
      explanationStyle: "exam-focused",
    },
  },

  // ── Biology ──────────────────────────────────────────────────────────────
  biology: {
    speech: {
      introStyle: "analytical",
      guidedPrefixByKind: {
        thesis:      "Core concept: ",
        mechanism:   "The mechanism is: ",
        trap:        "Exception to note: ",
        dat_fact:    "Key fact: ",
        definition:  "Core concept: ",
      },
      focusKinds:    ["thesis", "definition"],
      essentialKinds: ["thesis", "definition", "mechanism", "dat_fact"],
    },
    studyNotes: {
      fieldLabels: {
        "Why This Matters": "Biological Significance",
        "Key Mechanism":    "Mechanism / Pathway",
        "Common Confusion": "Common Misconception",
        "Quick Memory":     "Memory Hook",
      },
      templateHints: {
        "Why This Matters": "Explain the biological or physiological significance.",
        "Key Mechanism":    "Describe the pathway or regulatory mechanism.",
      },
      preferredLayouts: ["concept_map", "flowchart"],
    },
    recall: {
      templates: [
        "What is the function of [structure/molecule]?",
        "What is the sequence of steps in [pathway]?",
        "What happens when [gene/enzyme] is absent or defective?",
      ],
      preferredQuestionTypes: ["mechanism", "pathway", "consequence"],
    },
    whiteboard: { preferredStyle: "flowchart" },
    expertBrain: {
      persona: "You are an expert biology and physiology educator. Explain the material using evidence from the source page, emphasizing mechanisms, pathways, and biological significance. Do not invent facts beyond what the source states.",
      reasoningPriorities: ["cause → mechanism → effect", "biological significance", "pathway sequence", "regulatory exceptions"],
      explanationStyle: "mechanistic-causal",
    },
  },

  // ── Chemistry ────────────────────────────────────────────────────────────
  chemistry: {
    speech: {
      introStyle: "analytical",
      guidedPrefixByKind: {
        thesis:    "Core concept: ",
        mechanism: "Reaction mechanism: ",
        trap:      "Common error: ",
        formula:   "Key equation: ",
      },
      focusKinds:    ["thesis", "mechanism"],
      essentialKinds: ["thesis", "mechanism", "formula", "trap"],
    },
    studyNotes: {
      fieldLabels: {
        "Why This Matters": "Chemical Significance",
        "Key Mechanism":    "Reaction Mechanism",
        "Common Confusion": "Common Error",
        "Quick Memory":     "Memory Hook",
      },
      templateHints: {
        "Why This Matters": "Explain why this reaction or concept matters.",
        "Key Mechanism":    "Describe the electron-pushing or bond-breaking mechanism.",
      },
      preferredLayouts: ["flowchart", "worked_steps"],
    },
    recall: {
      templates: [
        "What is the product of [reaction]?",
        "What is the mechanism for [transformation]?",
        "What is the most common error when [reaction condition]?",
      ],
      preferredQuestionTypes: ["reaction", "mechanism", "prediction"],
    },
    whiteboard: { preferredStyle: "diagram" },
    expertBrain: {
      persona: "You are an expert chemistry educator. Explain the material using evidence from the source page, emphasizing reaction mechanisms, molecular reasoning, and common student errors. Do not invent chemical facts beyond what the source states.",
      reasoningPriorities: ["reactant → mechanism → product", "reaction conditions", "common mistakes and why they occur"],
      explanationStyle: "mechanistic-causal",
    },
  },

  // ── Physics ──────────────────────────────────────────────────────────────
  physics: {
    speech: {
      introStyle: "analytical",
      guidedPrefixByKind: {
        thesis:    "The principle is: ",
        mechanism: "The derivation is: ",
        trap:      "Common mistake: ",
        formula:   "The formula is: ",
      },
      focusKinds:    ["thesis", "formula"],
      essentialKinds: ["thesis", "formula", "mechanism", "trap"],
    },
    studyNotes: {
      fieldLabels: {
        "Why This Matters": "Physical Significance",
        "Key Mechanism":    "Derivation / Proof",
        "Common Confusion": "Common Mistake",
        "Quick Memory":     "Intuition / Pattern",
      },
      templateHints: {
        "Why This Matters": "Explain the physical significance and real-world application.",
        "Key Mechanism":    "Show the derivation from first principles.",
      },
      preferredLayouts: ["worked_steps", "diagram"],
    },
    recall: {
      templates: [
        "State [principle/law] and its conditions.",
        "Derive the formula for [physical quantity].",
        "What is the most common mistake when applying [concept]?",
      ],
      preferredQuestionTypes: ["derivation", "application", "error_spotting"],
    },
    whiteboard: { preferredStyle: "diagram" },
    expertBrain: {
      persona: "You are an expert physics educator. Explain the material using evidence from the source page, emphasizing physical intuition, derivation from first principles, and common conceptual mistakes. Do not invent physical facts beyond what the source states.",
      reasoningPriorities: ["physical intuition first", "derivation from principles", "units and boundary conditions", "common mistakes"],
      explanationStyle: "intuitive-analytical",
    },
  },

  // ── Mathematics ──────────────────────────────────────────────────────────
  math: {
    speech: {
      introStyle: "procedural",
      guidedPrefixByKind: {
        thesis:      "Key rule or theorem: ",
        mechanism:   "Procedure step: ",
        trap:        "Common error to avoid: ",
        formula:     "The formula is: ",
        application: "Worked example: ",
      },
      focusKinds:    ["thesis", "formula"],
      essentialKinds: ["thesis", "formula", "mechanism", "trap"],
    },
    studyNotes: {
      fieldLabels: {
        "Why This Matters": "Mathematical Significance",
        "Key Mechanism":    "Proof / Derivation",
        "Common Confusion": "Common Error",
        "Quick Memory":     "Mnemonic / Pattern",
      },
      templateHints: {
        "Why This Matters": "Explain when and why this theorem or formula is used.",
        "Key Mechanism":    "Show the derivation or proof steps.",
      },
      preferredLayouts: ["worked_steps", "concept_map"],
    },
    recall: {
      templates: [
        "State the theorem for [topic].",
        "Solve [example problem type].",
        "What is the most common error when applying [technique]?",
      ],
      preferredQuestionTypes: ["proof", "worked_example", "error_spotting"],
    },
    whiteboard: { preferredStyle: "worked_steps" },
    expertBrain: {
      persona: "You are an expert mathematics educator. Explain the material using evidence from the source page, making abstract structures intuitive through precise condition→conclusion reasoning. Do not invent mathematical facts, examples, or proofs beyond what the source states.",
      reasoningPriorities: ["condition → theorem → consequence", "intuitive explanation", "worked examples", "common errors"],
      explanationStyle: "intuitive-visual",
    },
  },

  // ── Computer Science ─────────────────────────────────────────────────────
  computer_science: {
    speech: {
      introStyle: "procedural",
      guidedPrefixByKind: {
        thesis:    "Core concept: ",
        mechanism: "Algorithm step: ",
        trap:      "Common bug: ",
        formula:   "Complexity: ",
        dat_fact:  "Key fact: ",
      },
      focusKinds:    ["thesis", "definition"],
      essentialKinds: ["thesis", "definition", "mechanism", "trap"],
    },
    studyNotes: {
      fieldLabels: {
        "Why This Matters": "Technical Significance",
        "Key Mechanism":    "Algorithm / Data Structure",
        "Common Confusion": "Common Bug / Pitfall",
        "Quick Memory":     "Implementation Pattern",
      },
      templateHints: {
        "Why This Matters": "Explain the technical significance and use cases.",
        "Key Mechanism":    "Describe the algorithm or data structure step by step.",
      },
      preferredLayouts: ["flowchart", "worked_steps"],
    },
    recall: {
      templates: [
        "What is the time complexity of [algorithm]?",
        "When would you use [data structure] over [alternative]?",
        "What is the most common bug when implementing [algorithm/pattern]?",
      ],
      preferredQuestionTypes: ["complexity", "tradeoff", "implementation"],
    },
    whiteboard: { preferredStyle: "flowchart" },
    expertBrain: {
      persona: "You are an expert computer science educator. Explain the material using evidence from the source page, emphasizing algorithmic reasoning, complexity tradeoffs, and common implementation pitfalls. Do not invent code behavior or benchmarks beyond what the source states.",
      reasoningPriorities: ["conceptual understanding first", "algorithm correctness", "complexity analysis", "common bugs"],
      explanationStyle: "procedural-analytical",
    },
  },

  // ── Law ──────────────────────────────────────────────────────────────────
  law: {
    speech: {
      introStyle: "socratic",
      guidedPrefixByKind: {
        thesis:      "The rule is: ",
        definition:  "The element is: ",
        mechanism:   "The element is: ",
        trap:        "Exception: ",
        dat_fact:    "Key holding: ",
        application: "Application: ",
      },
      focusKinds:    ["thesis"],
      essentialKinds: ["thesis", "definition", "mechanism", "trap"],
    },
    studyNotes: {
      fieldLabels: {
        "Why This Matters": "Legal Significance",
        "Key Mechanism":    "Elements / Legal Test",
        "Common Confusion": "Common Pitfall",
        "Quick Memory":     "Rule Mnemonic",
      },
      templateHints: {
        "Why This Matters": "Explain the legal significance and when this rule applies.",
        "Key Mechanism":    "State the legal test or elements in order.",
      },
      preferredLayouts: ["decision_tree", "concept_map"],
    },
    recall: {
      templates: [
        "What are the elements of [legal rule]?",
        "What is the exception to [rule]?",
        "Apply [rule] to [hypothetical fact pattern].",
      ],
      preferredQuestionTypes: ["rule_application", "exception", "hypothetical"],
    },
    whiteboard: { preferredStyle: "flowchart" },
    expertBrain: {
      persona: "You are an expert legal educator. Explain the material using evidence from the source page, emphasizing rules, elements, exceptions, and their application to facts. Do not invent legal conclusions, case holdings, or statutory interpretations beyond what the source states.",
      reasoningPriorities: ["state the rule first", "elements in order", "exceptions and limitations", "application to facts"],
      explanationStyle: "IRAC-structured",
    },
  },

  // ── Business / Economics ─────────────────────────────────────────────────
  business: {
    speech: {
      introStyle: "analytical",
      guidedPrefixByKind: {
        thesis:    "Key principle: ",
        mechanism: "The strategy is: ",
        trap:      "Key risk: ",
        dat_fact:  "Key metric: ",
      },
      focusKinds:    ["thesis", "definition"],
      essentialKinds: ["thesis", "definition", "mechanism", "trap"],
    },
    studyNotes: {
      fieldLabels: {
        "Why This Matters": "Business Impact",
        "Key Mechanism":    "Strategy / Framework",
        "Common Confusion": "Common Mistake",
        "Quick Memory":     "Framework Mnemonic",
      },
      templateHints: {
        "Why This Matters": "Explain the business or economic significance.",
        "Key Mechanism":    "Describe the strategic framework or decision model.",
      },
      preferredLayouts: ["concept_map", "flowchart"],
    },
    recall: {
      templates: [
        "What is the principle behind [business concept]?",
        "What are the key risks in [strategy]?",
        "Apply [framework] to [business scenario].",
      ],
      preferredQuestionTypes: ["case_application", "strategy", "risk"],
    },
    whiteboard: { preferredStyle: "concept_map" },
    expertBrain: {
      persona: "You are an expert business and economics educator. Explain the material using evidence from the source page, emphasizing strategic principles, frameworks, and decision-making logic. Do not invent business facts, financial projections, or market data beyond what the source states.",
      reasoningPriorities: ["governing principle", "strategic framework", "decision criteria", "key risks"],
      explanationStyle: "strategic-analytical",
    },
  },

  // ── Humanities ───────────────────────────────────────────────────────────
  humanities: {
    speech: {
      introStyle: "narrative",
      guidedPrefixByKind: {
        thesis:      "Central thesis: ",
        mechanism:   "Supporting evidence: ",
        trap:        "Counterargument: ",
        application: "Theme: ",
        dat_fact:    "Evidence: ",
      },
      focusKinds:    ["thesis", "definition"],
      essentialKinds: ["thesis", "mechanism", "application", "comparison"],
    },
    studyNotes: {
      fieldLabels: {
        "Why This Matters": "Historical / Philosophical Significance",
        "Key Mechanism":    "Evidence / Argument",
        "Common Confusion": "Counterargument",
        "Quick Memory":     "Context Anchor",
      },
      templateHints: {
        "Why This Matters": "Explain the historical, philosophical, or social significance.",
        "Key Mechanism":    "State the primary evidence or argument chain.",
      },
      preferredLayouts: ["timeline", "concept_map"],
    },
    recall: {
      templates: [
        "What is the author's central thesis in [passage]?",
        "What evidence supports [argument]?",
        "What is the strongest counterargument to [position]?",
      ],
      preferredQuestionTypes: ["argument", "evidence", "context"],
    },
    whiteboard: { preferredStyle: "timeline" },
    expertBrain: {
      persona: "You are an expert humanities educator. Explain the material using evidence from the source page, emphasizing argument structure, historical context, and interpretive significance. Do not invent historical facts, philosophical claims, or interpretations beyond what the source states.",
      reasoningPriorities: ["thesis first", "primary evidence", "counterarguments", "broader significance"],
      explanationStyle: "argumentative-contextual",
    },
  },

  // ── Fiction / Literature ─────────────────────────────────────────────────
  fiction: {
    speech: {
      introStyle: "narrative",
      guidedPrefixByKind: {
        thesis:      "Central theme: ",
        mechanism:   "Plot event: ",
        trap:        "Foreshadowing: ",
        application: "Character action: ",
        memoryAnchor:"Symbolism: ",
      },
      focusKinds:    ["thesis"],
      essentialKinds: ["thesis", "mechanism", "application", "trap"],
    },
    studyNotes: {
      fieldLabels: {
        "Why This Matters": "Thematic Significance",
        "Key Mechanism":    "Plot / Narrative Structure",
        "Common Confusion": "Authorial Technique",
        "Quick Memory":     "Symbol / Motif",
      },
      templateHints: {
        "Why This Matters": "Explain the thematic or character significance.",
        "Key Mechanism":    "Describe the plot development or narrative structure.",
      },
      preferredLayouts: ["timeline", "concept_map"],
    },
    recall: {
      templates: [
        "What theme does [event/scene] develop?",
        "How does [character] change in [passage]?",
        "What literary technique is used in [passage] and what is its effect?",
      ],
      preferredQuestionTypes: ["theme", "character", "technique"],
    },
    whiteboard: { preferredStyle: "timeline" },
    expertBrain: {
      persona: "You are an expert literature educator. Explain the material using evidence from the source page, surfacing thematic meaning, character motivation, and the author's craft. Do not invent plot details, character motivations, or interpretations beyond what the source states.",
      reasoningPriorities: ["theme over plot summary", "character motivation", "authorial technique", "deeper meaning"],
      explanationStyle: "interpretive-narrative",
    },
  },

  // ── Pilot / Aviation ─────────────────────────────────────────────────────
  pilot: {
    speech: {
      introStyle: "procedural",
      guidedPrefixByKind: {
        thesis:    "Normal procedure: ",
        trap:      "Abnormal / emergency: ",
        dat_fact:  "Memory item: ",
        formula:   "Performance calculation: ",
        mechanism: "Procedure step: ",
      },
      focusKinds:    ["thesis", "trap"],
      essentialKinds: ["thesis", "trap", "dat_fact", "mechanism"],
    },
    studyNotes: {
      fieldLabels: {
        "Why This Matters": "Flight Safety Significance",
        "Key Mechanism":    "Procedure / Checklist",
        "Common Confusion": "Common Error / Abnormal",
        "Quick Memory":     "Memory Item",
      },
      templateHints: {
        "Why This Matters": "Explain the flight safety significance.",
        "Key Mechanism":    "State the checklist or procedure steps.",
      },
      preferredLayouts: ["procedure_flow", "flowchart"],
    },
    recall: {
      templates: [
        "What is the correct procedure for [situation]?",
        "What is the memory item for [abnormal condition]?",
        "What is the performance calculation for [flight phase]?",
      ],
      preferredQuestionTypes: ["procedure", "emergency", "calculation"],
    },
    whiteboard: { preferredStyle: "flowchart" },
    expertBrain: {
      persona: "You are an expert aviation educator and flight instructor. Explain the material using evidence from the source page, emphasizing procedural accuracy, safety, and memory items. Do not invent flight procedures, regulations, or performance data beyond what the source states.",
      reasoningPriorities: ["safety first", "procedure accuracy", "memory items", "abnormal/emergency recognition"],
      explanationStyle: "procedural-sequential",
    },
  },

  // ── Notes / Outline ──────────────────────────────────────────────────────
  notes: {
    speech: {
      introStyle: "analytical",
      guidedPrefixByKind: {
        thesis:      "Main point: ",
        mechanism:   "Detail: ",
        trap:        "Watch out: ",
        dat_fact:    "Key fact: ",
        application: "Example: ",
      },
      focusKinds:    ["thesis", "definition"],
      essentialKinds: ["thesis", "definition", "mechanism", "dat_fact"],
    },
    studyNotes: {
      fieldLabels: {},
      templateHints: {
        "Why This Matters": "Explain why this point is important.",
        "Key Mechanism":    "Expand on the key details.",
      },
      preferredLayouts: ["concept_map", "flowchart"],
    },
    recall: {
      templates: [
        "What is the main point about [topic]?",
        "What detail should you remember about [concept]?",
        "What is the key fact from [section]?",
      ],
      preferredQuestionTypes: ["recall", "summary", "detail"],
    },
    whiteboard: { preferredStyle: "concept_map" },
    expertBrain: {
      persona: "You are an expert academic educator. Explain the material using evidence from the source page, emphasizing the most important points and key details. Do not invent facts beyond what the source states.",
      reasoningPriorities: ["main point first", "supporting details", "key facts", "things to remember"],
      explanationStyle: "outline-sequential",
    },
  },

  // ── Engineering (new) ─────────────────────────────────────────────────────
  engineering: {
    speech: {
      introStyle: "procedural",
      guidedPrefixByKind: {
        thesis:    "Key principle: ",
        mechanism: "Design step: ",
        trap:      "Failure mode to avoid: ",
        formula:   "The formula is: ",
        dat_fact:  "Safety constraint: ",
        keyDetail: "Design constraint: ",
      },
      focusKinds:    ["thesis", "formula"],
      essentialKinds: ["thesis", "formula", "mechanism", "trap"],
    },
    studyNotes: {
      fieldLabels: {
        "Why This Matters": "Engineering Significance",
        "Key Mechanism":    "Design Logic",
        "Common Confusion": "Common Failure Mode",
        "Quick Memory":     "Rule of Thumb",
      },
      templateHints: {
        "Why This Matters": "Explain the engineering significance and real-world consequences.",
        "Key Mechanism":    "Describe the design principle or calculation approach.",
      },
      preferredLayouts: ["diagram", "worked_steps"],
    },
    recall: {
      templates: [
        "What is the design principle for [scenario]?",
        "What is the failure mode of [component/system]?",
        "Calculate [quantity] given [constraints].",
      ],
      preferredQuestionTypes: ["design", "failure_analysis", "calculation"],
    },
    whiteboard: { preferredStyle: "diagram" },
    expertBrain: {
      persona: "You are an expert engineering educator. Explain the material using evidence from the source page, emphasizing design principles, failure modes, safety factors, and practical constraints. Do not invent engineering specifications, material properties, or safety values beyond what the source states.",
      reasoningPriorities: ["principle → design → constraint", "failure modes", "safety factors", "worked examples"],
      explanationStyle: "design-constraint-analytical",
    },
  },

  // ── Architecture / Design (new) ───────────────────────────────────────────
  architecture: {
    speech: {
      introStyle: "narrative",
      guidedPrefixByKind: {
        thesis:      "Design principle: ",
        mechanism:   "Spatial relationship: ",
        trap:        "Design constraint: ",
        application: "Precedent: ",
        formula:     "Structural system: ",
        memoryAnchor:"Key precedent: ",
      },
      focusKinds:    ["thesis"],
      essentialKinds: ["thesis", "mechanism", "application", "trap"],
    },
    studyNotes: {
      fieldLabels: {
        "Why This Matters": "Design Significance",
        "Key Mechanism":    "Spatial / Structural Logic",
        "Common Confusion": "Design Tension",
        "Quick Memory":     "Key Precedent",
      },
      templateHints: {
        "Why This Matters": "Explain the design significance and spatial experience.",
        "Key Mechanism":    "Describe the spatial or structural logic.",
      },
      preferredLayouts: ["diagram", "concept_map"],
    },
    recall: {
      templates: [
        "What design principle governs [spatial element]?",
        "Name a precedent that illustrates [design concept].",
        "What constraint shaped the design of [building/space]?",
      ],
      preferredQuestionTypes: ["principle", "precedent", "constraint"],
    },
    whiteboard: { preferredStyle: "diagram" },
    expertBrain: {
      persona: "You are an expert architecture educator. Explain the material using evidence from the source page, emphasizing design principles, spatial relationships, structural systems, and historical precedents. Do not invent architectural specifications, precedent details, or design decisions beyond what the source states.",
      reasoningPriorities: ["design principle first", "spatial relationships", "structural considerations", "historical precedents"],
      explanationStyle: "spatial-contextual",
    },
  },
};

// ─── Default extension when no per-preset data exists ────────────────────────

const DEFAULT_EXTENSION: ExpertProfileExtension = PROFILE_EXTENSIONS.universal;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns the full ExpertProfile for the given preset ID.
 * Merges DomainPreset (taxonomy/detection from domainPresets.ts) with
 * ExpertProfileExtension (speech/brain/notes from this registry).
 * Always returns a valid profile — falls back to universal if unknown.
 */
export function getExpertProfile(presetId: string): ExpertProfile {
  const preset = getDomainPreset(presetId);
  const ext = PROFILE_EXTENSIONS[presetId] ?? DEFAULT_EXTENSION;
  return { ...preset, ...ext };
}

/**
 * Lists all profiles that have full ExpertProfileExtension data.
 * Equivalent to getExpertProfile() for every registered preset.
 */
export function listExpertProfiles(): ExpertProfile[] {
  return [UNIVERSAL_PRESET, ...DOMAIN_PRESETS].map((p) => ({
    ...p,
    ...(PROFILE_EXTENSIONS[p.id] ?? DEFAULT_EXTENSION),
  }));
}

/**
 * Returns only the ExpertProfileExtension fields for the given preset.
 * Useful when you only need the speech/brain layer without DomainPreset data.
 */
export function getProfileExtension(presetId: string): ExpertProfileExtension {
  return PROFILE_EXTENSIONS[presetId] ?? DEFAULT_EXTENSION;
}
