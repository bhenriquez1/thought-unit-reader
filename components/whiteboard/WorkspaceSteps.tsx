// components/whiteboard/WorkspaceSteps.tsx
// 7-step structured learning workspace derived from CurrentPageStudyModel.
// Replaces the sequential "Teach" flash-card view in WhiteboardPanel.
// Each step maps to a distinct stage of deep understanding:
//   1 Core Concept  →  2 Why It Matters  →  3 Mechanism
//   4 Clinical Example  →  5 Common Mistakes  →  6 DAT Question  →  7 Memory Anchor
// Rendering: colored callout cards, mechanism arrows, collapsible depth.

"use client";

import React, { useState } from "react";
import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";
import type { NoteCard } from "@/lib/insights/synthesizeTeachingOutput";

interface StepConfig {
  id: number;
  label: string;
  icon: string;
  color: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  badgeClass: string;
}

const STEPS: StepConfig[] = [
  { id: 1, label: "Core Concept",     icon: "⚡", color: "#fcd34d", bgClass: "bg-yellow-900/20",  borderClass: "border-yellow-500/30", textClass: "text-yellow-100",  badgeClass: "bg-yellow-500/80 text-black" },
  { id: 2, label: "Why It Matters",   icon: "🎯", color: "#34d399", bgClass: "bg-emerald-900/20", borderClass: "border-emerald-500/30", textClass: "text-emerald-50",  badgeClass: "bg-emerald-500/80 text-black" },
  { id: 3, label: "Mechanism",        icon: "⚙️", color: "#60a5fa", bgClass: "bg-blue-900/20",    borderClass: "border-blue-500/30",   textClass: "text-blue-50",     badgeClass: "bg-blue-500/80 text-white"  },
  { id: 4, label: "Clinical Example", icon: "🩺", color: "#a78bfa", bgClass: "bg-violet-900/20",  borderClass: "border-violet-500/30", textClass: "text-violet-50",   badgeClass: "bg-violet-500/80 text-white" },
  { id: 5, label: "Common Mistakes",  icon: "⚠️", color: "#fb923c", bgClass: "bg-orange-900/20",  borderClass: "border-orange-500/30", textClass: "text-orange-50",   badgeClass: "bg-orange-500/80 text-black" },
  { id: 6, label: "DAT Question",     icon: "❓", color: "#e879f9", bgClass: "bg-pink-900/20",    borderClass: "border-pink-500/30",   textClass: "text-pink-50",     badgeClass: "bg-pink-500/80 text-white"  },
  { id: 7, label: "Memory Anchor",    icon: "🧠", color: "#a78bfa", bgClass: "bg-purple-900/20",  borderClass: "border-purple-500/30", textClass: "text-purple-50",   badgeClass: "bg-purple-500/80 text-white" },
];

interface StepContent {
  stepId: number;
  content: string;
  bullets?: string[];
}

interface WorkspaceStepsProps {
  studyModel: Record<string, unknown> | CurrentPageStudyModel | null;
  pageTitle?: string | null;
  noteCards?: NoteCard[];
}

function extractStepContent(
  studyModel: Record<string, unknown> | CurrentPageStudyModel | null,
  noteCards: NoteCard[],
): StepContent[] {
  const sm = studyModel as any;
  const sn = sm?.studyNotes as any;

  // Helper: pull first noteCard matching a type
  const noteCard = (type: string) => noteCards.find(c => c.type === type)?.body ?? "";

  // Step 1 — Core Concept
  const coreText =
    sm?.pageThesis ||
    noteCard("must_know") ||
    (sm?.conceptBlocks?.[0]?.title ? `${sm.conceptBlocks[0].title}` : "");

  // Step 2 — Why It Matters
  const whyText =
    sn?.whyThisMatters ||
    noteCard("why_this_matters") ||
    (sm?.conceptBlocks?.[0]?.clinicalRelevance ?? "");

  // Step 3 — Mechanism
  const mechanismText =
    sn?.keyMechanism ||
    noteCard("mechanism") ||
    (sm?.conceptBlocks?.[0]?.mechanism ?? "");

  // Step 4 — Clinical Example
  const clinicalText =
    noteCard("clinical_reasoning") ||
    noteCard("clinical_pearl") ||
    sn?.examSignal ||
    (sm?.conceptBlocks?.map((b: any) => b.clinicalApplication).filter(Boolean)[0] ?? "");

  // Step 5 — Common Mistakes
  const mistakeText =
    sn?.commonConfusion ||
    noteCard("dat_trap") ||
    noteCard("common_mistake") ||
    (sm?.conceptBlocks?.map((b: any) => b.trap).filter(Boolean).join(" / ") ?? "");

  // Step 6 — DAT Question
  const miniTest = sm?.miniTest as any[] | undefined;
  const datQText =
    (miniTest && miniTest.length > 0)
      ? `${miniTest[0]?.stem ?? miniTest[0]?.question ?? String(miniTest[0])}`
      : noteCard("recall_questions") ||
        "No DAT question available for this page yet. Ask the Chief Resident to generate one.";

  // Step 7 — Memory Anchor
  const memoryText =
    sn?.quickMemory ||
    noteCard("memory_hook") ||
    (sm?.conceptBlocks?.map((b: any) => b.memoryHook ?? b.memoryShortcut).filter(Boolean)[0] ?? "");

  return [
    { stepId: 1, content: coreText },
    { stepId: 2, content: whyText },
    { stepId: 3, content: mechanismText, bullets: extractMechanismBullets(sm) },
    { stepId: 4, content: clinicalText },
    { stepId: 5, content: mistakeText, bullets: extractMistakeBullets(sm, noteCards) },
    { stepId: 6, content: datQText },
    { stepId: 7, content: memoryText },
  ];
}

function extractMechanismBullets(sm: any): string[] | undefined {
  if (!sm?.conceptBlocks?.length) return undefined;
  const bullets: string[] = [];
  for (const cb of sm.conceptBlocks.slice(0, 3)) {
    if (cb.mechanism && cb.title) bullets.push(`${cb.title}: ${cb.mechanism}`);
    else if (cb.mechanism) bullets.push(cb.mechanism);
  }
  return bullets.length > 1 ? bullets : undefined;
}

function extractMistakeBullets(sm: any, noteCards: NoteCard[]): string[] | undefined {
  const bullets: string[] = [];
  const traps = noteCards.filter(c => c.type === "dat_trap" || c.type === "common_mistake");
  for (const t of traps.slice(0, 3)) if (t.body) bullets.push(t.body);
  if (sm?.conceptBlocks) {
    for (const cb of sm.conceptBlocks.slice(0, 4)) {
      if (cb.trap) bullets.push(cb.trap);
    }
  }
  return bullets.length > 1 ? bullets : undefined;
}

// ---------------------------------------------------------------------------
// Single step card
// ---------------------------------------------------------------------------

function StepCard({
  step,
  content,
  bullets,
  isActive,
  isCompleted,
  onClick,
}: {
  step: StepConfig;
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
          ? "border-white/5 opacity-40 cursor-default"
          : isActive
          ? `${step.bgClass} ${step.borderClass} shadow-lg cursor-pointer`
          : isCompleted
          ? "border-white/10 bg-white/3 cursor-pointer hover:bg-white/5"
          : "border-white/8 bg-white/2 cursor-pointer hover:bg-white/5"
      }`}
    >
      {/* Step header */}
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

      {/* Expanded content */}
      {isActive && !isEmpty && (
        <div className="px-4 pb-4 pt-0">
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

// ---------------------------------------------------------------------------
// Connector arrow between steps
// ---------------------------------------------------------------------------

function StepArrow({ color }: { color: string }) {
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
// Main component
// ---------------------------------------------------------------------------

export default function WorkspaceSteps({ studyModel, pageTitle, noteCards = [] }: WorkspaceStepsProps) {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const stepContents = extractStepContent(studyModel, noteCards);
  const hasAnyContent = stepContents.some(s => s.content.trim());

  if (!hasAnyContent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[260px] px-6 text-center gap-4">
        <div className="text-3xl">🗺</div>
        <div className="text-[13px] font-semibold text-white/60">Workspace not ready</div>
        <div className="text-[11.5px] text-white/30 max-w-[240px] leading-relaxed">
          Open an instructional page — the 7-step workspace appears once the Study Sheet loads.
        </div>
      </div>
    );
  }

  const handleStepClick = (stepId: number) => {
    if (activeStep === stepId) {
      // Collapse current and mark complete
      setCompletedSteps(prev => new Set([...prev, stepId]));
      const next = stepContents.find(s => s.stepId > stepId && s.content.trim())?.stepId;
      if (next) setActiveStep(next);
    } else {
      setActiveStep(stepId);
    }
  };

  return (
    <div className="flex flex-col px-3 py-2 gap-0.5 overflow-y-auto max-h-[calc(100vh-280px)]">
      {/* Title */}
      {pageTitle && (
        <div className="px-1 pb-2 text-[11px] font-semibold text-white/50 truncate">
          {pageTitle}
        </div>
      )}

      {/* Progress bar */}
      <div className="flex items-center gap-1 mb-2 px-1">
        {STEPS.map((s, i) => {
          const sc = stepContents.find(c => c.stepId === s.id);
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
              {i < STEPS.length - 1 && (
                <div className="w-0.5 h-1 bg-transparent" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Steps */}
      {STEPS.map((step, i) => {
        const sc = stepContents.find(c => c.stepId === step.id)!;
        const isActive = activeStep === step.id;
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
            {i < STEPS.length - 1 && !isActive && (
              <StepArrow color={step.color} />
            )}
          </React.Fragment>
        );
      })}

      {/* Reset */}
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
