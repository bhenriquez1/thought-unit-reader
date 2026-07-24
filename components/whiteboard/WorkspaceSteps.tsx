// components/whiteboard/WorkspaceSteps.tsx
// Subject-aware structured learning workspace derived from CurrentPageStudyModel.
// Detects page subject (chemistry/physics, biology, clinical/dental, or default)
// and applies the matching step schema:
//
//   CHEMISTRY / PHYSICS — problem-solving flow
//     Concept → Known Info → Rule/Equation → Step-by-Step → Calculation → Trap → DAT Check → Anchor
//
//   BIOLOGY — conceptual mechanism flow
//     Concept → Why It Matters → Mechanism → Application → Common Mistakes → DAT Question → Anchor
//
//   CLINICAL / DENTAL — clinical-reasoning flow
//     Concept → Why It Matters → Mechanism → Clinical Case → Diagnosis/Treatment → Mistakes → Anchor
//
//   DEFAULT (general) — 7-step general flow
//     Concept → Why It Matters → Mechanism → Clinical Example → Common Mistakes → DAT Question → Anchor

"use client";

import React, { useState } from "react";
import type { NoteCard } from "@/lib/insights/synthesizeTeachingOutput";

// ---------------------------------------------------------------------------
// Subject detection
// ---------------------------------------------------------------------------

type PageSubject = "chemistry" | "biology" | "clinical" | "default";

function detectPageSubject(sm: any, noteCards: NoteCard[]): PageSubject {
  const thesis  = (sm?.pageThesis ?? "").toLowerCase();
  const mechTxt = (sm?.studyNotes?.keyMechanism ?? "").toLowerCase();
  const whyTxt  = (sm?.studyNotes?.whyThisMatters ?? "").toLowerCase();
  const combined = `${thesis} ${mechTxt} ${whyTxt}`;

  // Chemistry / physics — calculation-first subjects
  const chemWords = [
    "stoichiometry","molar mass","molarity","molality","mol","equation",
    "reaction","electron","orbital","periodic","balancing","oxidation",
    "reduction","equilibrium","acid","base","buffer","ph","pressure",
    "temperature","gas law","energy","enthalpy","entropy",
    "electronegativity","hybridization","resonance","isomer","polymer",
    "coulomb","joule","wavelength","frequency","photon",
  ];
  if (chemWords.some(w => combined.includes(w))) return "chemistry";
  if (noteCards.some(c => c.type === "formula_breakdown")) return "chemistry";

  // Biology — concept/mechanism subjects
  const bioWords = [
    "cell","protein","dna","rna","gene","chromosome","mitosis","meiosis",
    "enzyme","metabolism","atp","photosynthesis","cellular respiration",
    "evolution","natural selection","membrane","organelle","nucleus",
    "transcription","translation","mutation","phenotype","genotype",
  ];
  if (bioWords.some(w => combined.includes(w))) return "biology";

  // Clinical / dental — patient-facing reasoning
  const clinWords = [
    "diagnosis","treatment","patient","clinical","dental","tooth","caries",
    "symptom","pathology","disease","therapy","pharmacology","prognosis",
    "complication","pulp","enamel","dentin","periodontal",
  ];
  if (clinWords.some(w => combined.includes(w))) return "clinical";

  return "default";
}

// ---------------------------------------------------------------------------
// Step configuration
// ---------------------------------------------------------------------------

interface StepDef {
  id: number;
  label: string;
  icon: string;
  color: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  badgeClass: string;
}

interface StepContent {
  stepId: number;
  content: string;
  bullets?: string[];
}

// Color palettes per step role
const STEP_COLORS = {
  concept:    { color: "#fcd34d", bgClass: "bg-yellow-900/20",  borderClass: "border-yellow-500/30", textClass: "text-yellow-100",  badgeClass: "bg-yellow-500/80 text-black" },
  why:        { color: "#34d399", bgClass: "bg-emerald-900/20", borderClass: "border-emerald-500/30", textClass: "text-emerald-50",  badgeClass: "bg-emerald-500/80 text-black" },
  mechanism:  { color: "#60a5fa", bgClass: "bg-blue-900/20",    borderClass: "border-blue-500/30",   textClass: "text-blue-50",     badgeClass: "bg-blue-500/80 text-white"  },
  known:      { color: "#818cf8", bgClass: "bg-indigo-900/20",  borderClass: "border-indigo-500/30", textClass: "text-indigo-50",   badgeClass: "bg-indigo-500/80 text-white" },
  equation:   { color: "#22d3ee", bgClass: "bg-cyan-900/20",    borderClass: "border-cyan-500/30",   textClass: "text-cyan-50",     badgeClass: "bg-cyan-500/80 text-black"  },
  steps:      { color: "#60a5fa", bgClass: "bg-blue-900/20",    borderClass: "border-blue-500/30",   textClass: "text-blue-50",     badgeClass: "bg-blue-500/80 text-white"  },
  calc:       { color: "#a3e635", bgClass: "bg-lime-900/20",    borderClass: "border-lime-500/30",   textClass: "text-lime-50",     badgeClass: "bg-lime-600/80 text-black"  },
  clinical:   { color: "#a78bfa", bgClass: "bg-violet-900/20",  borderClass: "border-violet-500/30", textClass: "text-violet-50",   badgeClass: "bg-violet-500/80 text-white" },
  diag:       { color: "#4ade80", bgClass: "bg-green-900/20",   borderClass: "border-green-500/30",  textClass: "text-green-50",    badgeClass: "bg-green-600/80 text-black" },
  mistakes:   { color: "#fb923c", bgClass: "bg-orange-900/20",  borderClass: "border-orange-500/30", textClass: "text-orange-50",   badgeClass: "bg-orange-500/80 text-black" },
  datcheck:   { color: "#e879f9", bgClass: "bg-pink-900/20",    borderClass: "border-pink-500/30",   textClass: "text-pink-50",     badgeClass: "bg-pink-500/80 text-white"  },
  anchor:     { color: "#c084fc", bgClass: "bg-purple-900/20",  borderClass: "border-purple-500/30", textClass: "text-purple-50",   badgeClass: "bg-purple-500/80 text-white" },
  application:{ color: "#34d399", bgClass: "bg-teal-900/20",    borderClass: "border-teal-500/30",   textClass: "text-teal-50",     badgeClass: "bg-teal-500/80 text-black"  },
};

// ---------------------------------------------------------------------------
// Schema definitions per subject
// ---------------------------------------------------------------------------

const CHEMISTRY_STEPS: StepDef[] = [
  { id: 1, label: "Core Concept",        icon: "⚡", ...STEP_COLORS.concept   },
  { id: 2, label: "Known Information",   icon: "📋", ...STEP_COLORS.known     },
  { id: 3, label: "Rule or Equation",    icon: "📐", ...STEP_COLORS.equation  },
  { id: 4, label: "Step-by-Step Setup",  icon: "🔢", ...STEP_COLORS.steps     },
  { id: 5, label: "Calculation",         icon: "🧮", ...STEP_COLORS.calc      },
  { id: 6, label: "Common Trap",         icon: "⚠️", ...STEP_COLORS.mistakes  },
  { id: 7, label: "DAT Check",           icon: "✓",  ...STEP_COLORS.datcheck  },
  { id: 8, label: "Memory Anchor",       icon: "🧠", ...STEP_COLORS.anchor    },
];

const BIOLOGY_STEPS: StepDef[] = [
  { id: 1, label: "Core Concept",        icon: "⚡", ...STEP_COLORS.concept    },
  { id: 2, label: "Why It Matters",      icon: "🎯", ...STEP_COLORS.why        },
  { id: 3, label: "Mechanism",           icon: "⚙️", ...STEP_COLORS.mechanism  },
  { id: 4, label: "Real-World Example",  icon: "🔬", ...STEP_COLORS.application},
  { id: 5, label: "Common Mistakes",     icon: "⚠️", ...STEP_COLORS.mistakes   },
  { id: 6, label: "DAT Question",        icon: "❓", ...STEP_COLORS.datcheck   },
  { id: 7, label: "Memory Anchor",       icon: "🧠", ...STEP_COLORS.anchor     },
];

const CLINICAL_STEPS: StepDef[] = [
  { id: 1, label: "Core Concept",        icon: "⚡", ...STEP_COLORS.concept   },
  { id: 2, label: "Why It Matters",      icon: "🎯", ...STEP_COLORS.why       },
  { id: 3, label: "Mechanism",           icon: "⚙️", ...STEP_COLORS.mechanism },
  { id: 4, label: "Clinical Case",       icon: "🩺", ...STEP_COLORS.clinical  },
  { id: 5, label: "Diagnosis / Tx",      icon: "💊", ...STEP_COLORS.diag      },
  { id: 6, label: "Common Mistakes",     icon: "⚠️", ...STEP_COLORS.mistakes  },
  { id: 7, label: "Memory Anchor",       icon: "🧠", ...STEP_COLORS.anchor    },
];

const DEFAULT_STEPS: StepDef[] = [
  { id: 1, label: "Core Concept",        icon: "⚡", ...STEP_COLORS.concept    },
  { id: 2, label: "Why It Matters",      icon: "🎯", ...STEP_COLORS.why        },
  { id: 3, label: "Mechanism",           icon: "⚙️", ...STEP_COLORS.mechanism  },
  { id: 4, label: "Clinical Example",    icon: "🩺", ...STEP_COLORS.clinical   },
  { id: 5, label: "Common Mistakes",     icon: "⚠️", ...STEP_COLORS.mistakes   },
  { id: 6, label: "DAT Question",        icon: "❓", ...STEP_COLORS.datcheck   },
  { id: 7, label: "Memory Anchor",       icon: "🧠", ...STEP_COLORS.anchor     },
];

function getStepDefs(subject: PageSubject): StepDef[] {
  if (subject === "chemistry") return CHEMISTRY_STEPS;
  if (subject === "biology")   return BIOLOGY_STEPS;
  if (subject === "clinical")  return CLINICAL_STEPS;
  return DEFAULT_STEPS;
}

// ---------------------------------------------------------------------------
// Content extraction — per-schema extractor
// ---------------------------------------------------------------------------

function noteCard(noteCards: NoteCard[], type: string): string {
  return noteCards.find(c => c.type === type)?.body ?? "";
}

function formulaCards(noteCards: NoteCard[]): string[] {
  return noteCards.filter(c => c.type === "formula_breakdown").map(c => c.body).filter(Boolean);
}

function extractChemistryContent(sm: any, noteCards: NoteCard[]): StepContent[] {
  const sn = sm?.studyNotes as any;
  const blocks = (sm?.conceptBlocks as any[] | undefined) ?? [];

  // 1 — Core Concept
  const concept = sm?.pageThesis || noteCard(noteCards, "must_know") || blocks[0]?.title || "";

  // 2 — Known Information: what the student is given in a typical problem
  const known =
    noteCard(noteCards, "why_this_matters") ||
    sn?.whyThisMatters ||
    blocks.map((b: any) => b.rule || b.pattern).filter(Boolean).slice(0, 2).join(" / ") ||
    "What information does the problem give you? List the known quantities and units before touching the equation.";

  // 3 — Rule or Equation: the governing law
  const formulaTexts = formulaCards(noteCards);
  const equation =
    formulaTexts.join("\n") ||
    noteCard(noteCards, "mechanism") ||
    sn?.keyMechanism ||
    blocks.map((b: any) => b.mechanism).filter(Boolean)[0] ||
    "";

  // 4 — Step-by-Step Setup: procedural breakdown
  const stepByStep =
    noteCard(noteCards, "mechanism") ||
    blocks.map((b: any) => b.mechanism).filter(Boolean).join(" → ") ||
    sn?.keyMechanism ||
    "";
  const mechanismBullets = blocks
    .slice(0, 5)
    .map((b: any) => b.mechanism || b.title)
    .filter(Boolean) as string[];

  // 5 — Calculation: worked example / numeric result
  const calculation =
    noteCard(noteCards, "clinical_reasoning") ||
    noteCard(noteCards, "application") ||
    blocks.map((b: any) => b.clinicalApplication || b.example).filter(Boolean)[0] ||
    "";

  // 6 — Common Trap
  const trap =
    sn?.commonConfusion ||
    noteCard(noteCards, "dat_trap") ||
    noteCard(noteCards, "common_mistake") ||
    blocks.map((b: any) => b.trap).filter(Boolean).join(" / ") ||
    "";
  const trapBullets = blocks.map((b: any) => b.trap).filter(Boolean) as string[];

  // 7 — DAT Check
  const miniTest = sm?.miniTest as any[] | undefined;
  const datCheck =
    (miniTest?.[0]?.stem ?? miniTest?.[0]?.question ?? (miniTest?.[0] ? String(miniTest[0]) : "")) ||
    noteCard(noteCards, "recall_questions") ||
    sn?.examSignal ||
    "";

  // 8 — Memory Anchor
  const anchor =
    sn?.quickMemory ||
    noteCard(noteCards, "memory_hook") ||
    blocks.map((b: any) => b.memoryHook ?? b.memoryShortcut).filter(Boolean)[0] ||
    "";

  return [
    { stepId: 1, content: concept },
    { stepId: 2, content: known },
    { stepId: 3, content: equation, bullets: formulaTexts.length > 1 ? formulaTexts : undefined },
    { stepId: 4, content: stepByStep, bullets: mechanismBullets.length > 1 ? mechanismBullets : undefined },
    { stepId: 5, content: calculation },
    { stepId: 6, content: trap, bullets: trapBullets.length > 1 ? trapBullets : undefined },
    { stepId: 7, content: datCheck },
    { stepId: 8, content: anchor },
  ];
}

function extractDefaultContent(sm: any, noteCards: NoteCard[]): StepContent[] {
  const sn = sm?.studyNotes as any;
  const blocks = (sm?.conceptBlocks as any[] | undefined) ?? [];
  const miniTest = sm?.miniTest as any[] | undefined;

  const concept    = sm?.pageThesis || noteCard(noteCards, "must_know") || blocks[0]?.title || "";
  const why        = sn?.whyThisMatters || noteCard(noteCards, "why_this_matters") || "";
  const mechanism  = sn?.keyMechanism || noteCard(noteCards, "mechanism") || blocks[0]?.mechanism || "";
  const mechBullets = blocks.slice(0, 3)
    .filter((b: any) => b.mechanism && b.title)
    .map((b: any) => `${b.title}: ${b.mechanism}`) as string[];
  const clinical   = noteCard(noteCards, "clinical_reasoning") || noteCard(noteCards, "clinical_pearl") ||
    sn?.examSignal || blocks.map((b: any) => b.clinicalApplication).filter(Boolean)[0] || "";
  const mistakes   = sn?.commonConfusion || noteCard(noteCards, "dat_trap") || noteCard(noteCards, "common_mistake") ||
    blocks.map((b: any) => b.trap).filter(Boolean).join(" / ") || "";
  const trapBullets = blocks.map((b: any) => b.trap).filter(Boolean) as string[];
  const datQ       = (miniTest?.[0]?.stem ?? miniTest?.[0]?.question ?? (miniTest?.[0] ? String(miniTest[0]) : "")) ||
    noteCard(noteCards, "recall_questions") || "";
  const anchor     = sn?.quickMemory || noteCard(noteCards, "memory_hook") ||
    blocks.map((b: any) => b.memoryHook ?? b.memoryShortcut).filter(Boolean)[0] || "";

  return [
    { stepId: 1, content: concept },
    { stepId: 2, content: why },
    { stepId: 3, content: mechanism, bullets: mechBullets.length > 1 ? mechBullets : undefined },
    { stepId: 4, content: clinical },
    { stepId: 5, content: mistakes, bullets: trapBullets.length > 1 ? trapBullets : undefined },
    { stepId: 6, content: datQ },
    { stepId: 7, content: anchor },
  ];
}

function extractContent(sm: any, noteCards: NoteCard[], subject: PageSubject): StepContent[] {
  if (subject === "chemistry") return extractChemistryContent(sm, noteCards);
  // biology and clinical reuse the default extractor — the step labels carry the meaning
  return extractDefaultContent(sm, noteCards);
}

// ---------------------------------------------------------------------------
// Step card
// ---------------------------------------------------------------------------

function StepCard({
  step, content, bullets, isActive, isCompleted, onClick,
}: {
  step: StepDef;
  content: string;
  bullets?: string[];
  isActive: boolean;
  isCompleted: boolean;
  onClick: () => void;
}) {
  const isEmpty = !content.trim() && (!bullets || bullets.length === 0);

  return (
    <div
      onClick={isEmpty ? undefined : onClick}
      className={`rounded-xl border transition-all duration-200 overflow-hidden ${
        isEmpty
          ? "border-white/5 opacity-30 cursor-default"
          : isActive
          ? `${step.bgClass} ${step.borderClass} shadow-lg cursor-pointer`
          : isCompleted
          ? "border-white/10 bg-white/3 cursor-pointer hover:bg-white/5"
          : "border-white/8 bg-white/2 cursor-pointer hover:bg-white/5"
      }`}
    >
      <div className="flex items-center gap-2.5 px-4 py-2.5">
        <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold shrink-0 ${
          isActive ? step.badgeClass : isCompleted ? "bg-white/20 text-white/60" : "bg-white/8 text-white/35"
        }`}>
          {isCompleted && !isActive ? "✓" : step.id}
        </div>
        <span className={`text-[11.5px] font-semibold ${isActive ? step.textClass : isCompleted ? "text-white/60" : "text-white/40"}`}>
          {step.icon} {step.label}
        </span>
        {!isEmpty && (
          <span className="ml-auto text-[10px] text-white/25">
            {isActive ? "▲" : "▼"}
          </span>
        )}
      </div>

      {isActive && !isEmpty && (
        <div className="px-4 pb-4">
          <div className={`text-[12px] leading-relaxed ${step.textClass}`}>
            {bullets && bullets.length > 1 ? (
              <>
                {content && <p className="mb-2 opacity-90">{content}</p>}
                <ul className="space-y-1.5 mt-1">
                  {bullets.map((b, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-0.5 shrink-0 opacity-50">→</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="opacity-90 whitespace-pre-wrap">{content}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StepConnector({ color }: { color: string }) {
  return (
    <div className="flex justify-center py-0.5">
      <div className="flex flex-col items-center">
        <div className="w-px h-3" style={{ background: `${color}40` }} />
        <div className="text-[10px]" style={{ color: `${color}60` }}>▼</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subject badge
// ---------------------------------------------------------------------------

const SUBJECT_LABELS: Record<PageSubject, { label: string; color: string }> = {
  chemistry: { label: "⚗️ Chem / Physics schema",   color: "text-cyan-400/60"   },
  biology:   { label: "🧬 Biology schema",           color: "text-emerald-400/60" },
  clinical:  { label: "🩺 Clinical schema",          color: "text-violet-400/60"  },
  default:   { label: "📚 General schema",           color: "text-slate-400/60"   },
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface WorkspaceStepsProps {
  studyModel: Record<string, unknown> | null;
  pageTitle?: string | null;
  noteCards?: NoteCard[];
}

export default function WorkspaceSteps({ studyModel, pageTitle, noteCards = [] }: WorkspaceStepsProps) {
  const sm = studyModel as any;
  const subject  = detectPageSubject(sm, noteCards);
  const stepDefs = getStepDefs(subject);
  const contents = extractContent(sm, noteCards, subject);

  const [activeStep,     setActiveStep]     = useState<number>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const hasAnyContent = contents.some(s => s.content.trim());

  if (!hasAnyContent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[260px] px-6 text-center gap-4">
        <div className="text-3xl">🗺</div>
        <div className="text-[13px] font-semibold text-white/60">Workspace not ready</div>
        <div className="text-[11.5px] text-white/30 max-w-[240px] leading-relaxed">
          Open an instructional page — the workspace appears once the Study Sheet loads.
        </div>
      </div>
    );
  }

  const handleStepClick = (stepId: number) => {
    if (activeStep === stepId) {
      setCompletedSteps(prev => new Set([...prev, stepId]));
      const next = contents.find(s => s.stepId > stepId && s.content.trim())?.stepId;
      if (next) setActiveStep(next);
    } else {
      setActiveStep(stepId);
    }
  };

  const subjectMeta = SUBJECT_LABELS[subject];

  return (
    <div className="flex flex-col px-3 py-2 gap-0.5 overflow-y-auto max-h-[calc(100vh-280px)]">
      {/* Title + subject badge */}
      <div className="px-1 pb-2 flex items-baseline gap-2">
        {pageTitle && (
          <div className="text-[11px] font-semibold text-white/50 truncate flex-1">{pageTitle}</div>
        )}
        <div className={`text-[9.5px] shrink-0 ${subjectMeta.color}`}>{subjectMeta.label}</div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-1 mb-2 px-1">
        {stepDefs.map((s, i) => {
          const sc = contents.find(c => c.stepId === s.id);
          const hasContent = sc?.content.trim();
          return (
            <React.Fragment key={s.id}>
              <div
                className="h-1 flex-1 rounded-full transition-colors duration-300"
                style={{
                  background: !hasContent
                    ? "rgba(255,255,255,0.05)"
                    : completedSteps.has(s.id)
                    ? s.color
                    : activeStep === s.id
                    ? `${s.color}80`
                    : "rgba(255,255,255,0.08)",
                }}
              />
              {i < stepDefs.length - 1 && <div className="w-0.5 h-1 bg-transparent" />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Steps */}
      {stepDefs.map((step, i) => {
        const sc = contents.find(c => c.stepId === step.id) ?? { stepId: step.id, content: "" };
        const isActive    = activeStep === step.id;
        const isCompleted = completedSteps.has(step.id) && !isActive;
        return (
          <React.Fragment key={step.id}>
            <StepCard
              step={step}
              content={sc.content}
              bullets={sc.bullets}
              isActive={isActive}
              isCompleted={isCompleted}
              onClick={() => handleStepClick(step.id)}
            />
            {i < stepDefs.length - 1 && !isActive && (
              <StepConnector color={step.color} />
            )}
          </React.Fragment>
        );
      })}

      {completedSteps.size > 0 && (
        <button
          onClick={() => { setCompletedSteps(new Set()); setActiveStep(1); }}
          className="mt-3 self-center text-[10.5px] text-white/25 hover:text-white/50 underline transition-colors"
        >
          Reset workspace
        </button>
      )}
    </div>
  );
}
