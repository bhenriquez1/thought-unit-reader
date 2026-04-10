"use client";
// components/apex/TrainingArena.tsx
// DAT Training Arena — Biology, General Chemistry, Organic Chemistry, PAT, QR/Math
// Each subject has 4 tabs: PDRM | Practice | Generate | Review

import React, { useState, useCallback } from "react";
import { useApexEngineStore } from "@/lib/stores/apexEngineStore";
import { DAT_PATTERNS, getPatternsByCategory } from "@/types/patterns";
import type { ApexSection } from "@/lib/apex/datApexTypes";
import { computeNextDifficulty } from "@/lib/apex/apexScoringEngine";

// ---------------------------------------------------------------------------
// Subject config
// ---------------------------------------------------------------------------

type Subject = {
  id: ApexSection;
  label: string;
  emoji: string;
  category: string;
  colorFrom: string;
  colorTo: string;
  border: string;
  textAccent: string;
};

const SUBJECTS: Subject[] = [
  {
    id: "bio",
    label: "Biology",
    emoji: "🧬",
    category: "biology",
    colorFrom: "from-purple-600/20",
    colorTo: "to-violet-600/20",
    border: "border-purple-500/30",
    textAccent: "text-purple-300",
  },
  {
    id: "gc",
    label: "General Chemistry",
    emoji: "⚗️",
    category: "general-chemistry",
    colorFrom: "from-blue-600/20",
    colorTo: "to-cyan-600/20",
    border: "border-blue-500/30",
    textAccent: "text-blue-300",
  },
  {
    id: "orgo",
    label: "Organic Chemistry",
    emoji: "🔬",
    category: "organic-chemistry",
    colorFrom: "from-green-600/20",
    colorTo: "to-emerald-600/20",
    border: "border-green-500/30",
    textAccent: "text-green-300",
  },
  {
    id: "pat",
    label: "PAT",
    emoji: "📐",
    category: "pat",
    colorFrom: "from-yellow-600/20",
    colorTo: "to-orange-600/20",
    border: "border-yellow-500/30",
    textAccent: "text-yellow-300",
  },
  {
    id: "qr",
    label: "QR / Math",
    emoji: "🔢",
    category: "reading-comprehension",
    colorFrom: "from-pink-600/20",
    colorTo: "to-rose-600/20",
    border: "border-pink-500/30",
    textAccent: "text-pink-300",
  },
];

type TabId = "pdrm" | "practice" | "generate" | "review";

// ---------------------------------------------------------------------------
// Question generator (template-based, no API needed)
// ---------------------------------------------------------------------------

function generateQuestionForPattern(
  patternId: string,
  section: ApexSection,
  difficulty: number,
  datPlus: boolean,
): {
  question: string;
  choices: string[];
  answer: string;
  explanation: string;
  pdrm: { pattern: string; decisionRule: string; trap: string };
} {
  const pattern = DAT_PATTERNS.find((p) => p.id === patternId);
  if (!pattern) {
    return {
      question: `Which of the following best demonstrates the key rule for this ${section.toUpperCase()} pattern?`,
      choices: ["Apply the rule directly", "Invert the rule", "Skip this step", "Use an approximation"],
      answer: "Apply the rule directly",
      explanation: "The core decision rule must be applied directly when the trigger condition is met.",
      pdrm: { pattern: "General Pattern", decisionRule: "Apply rule to trigger", trap: "Do not invert or approximate" },
    };
  }

  const rule = pattern.rules?.[0];
  const trap = pattern.commonMistakes?.[0] || "Misapplying the rule";
  const diffStr = datPlus ? " (harder variant)" : difficulty > 6 ? " (hard)" : "";

  const stems = [
    `Based on the trigger "${pattern.description?.slice(0, 60) || pattern.name}", what is the correct next step${diffStr}?`,
    `Which statement about "${pattern.name}" is most accurate according to the decision rule${diffStr}?`,
    `A student encounters a problem that triggers "${pattern.name}". What should they do first${diffStr}?`,
  ];
  const question = stems[difficulty % stems.length];

  const correct = rule?.description || `Apply the ${pattern.name} rule correctly`;
  const distractors = datPlus
    ? [
        trap,
        `Reverse the ${pattern.name} logic and check boundary conditions`,
        `Apply only part of the decision rule without considering exceptions`,
      ]
    : [
        trap,
        `Skip the ${pattern.name} check and use a generic approach`,
        `Apply a similar rule from a different context`,
      ];

  const choices = shuffleArray([correct, ...distractors.slice(0, 3)]);

  return {
    question,
    choices,
    answer: correct,
    explanation: `${pattern.name}: ${rule?.description || correct}. Common trap: ${trap}.`,
    pdrm: {
      pattern: pattern.name,
      decisionRule: rule?.description || correct,
      trap,
    },
  };
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PdrmTab({ subject }: { subject: Subject }) {
  const patterns = getPatternsByCategory(subject.category as never);
  const storePatterns = useApexEngineStore((s) =>
    s.patterns.filter((p) => p.section === subject.id),
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Pattern · Decision Rule · Mechanism · Trap — the 4 frames to own before
        you practice.
      </p>
      {patterns.slice(0, 6).map((p) => {
        const stored = storePatterns.find((sp) => sp.id === p.id);
        return (
          <div key={p.id} className="bg-black/20 rounded-lg p-4 border border-gray-600/30">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-white text-sm">{p.name}</span>
              {stored && stored.timesSeen > 0 && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    stored.masteryLevel === "mastered"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : stored.masteryLevel === "strong"
                        ? "bg-green-500/20 text-green-300"
                        : stored.masteryLevel === "unstable"
                          ? "bg-yellow-500/20 text-yellow-300"
                          : "bg-gray-500/20 text-gray-400"
                  }`}
                >
                  {stored.masteryLevel}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-purple-400 font-medium">Pattern</span>
                <p className="text-gray-300 mt-0.5">{p.description}</p>
              </div>
              <div>
                <span className="text-blue-400 font-medium">Decision Rule</span>
                <p className="text-gray-300 mt-0.5">
                  {p.rules?.[0]?.description || "—"}
                </p>
              </div>
              <div>
                <span className="text-green-400 font-medium">Mechanism</span>
                <p className="text-gray-300 mt-0.5">
                  {p.examples?.[0] || "—"}
                </p>
              </div>
              <div>
                <span className="text-rose-400 font-medium">Trap</span>
                <p className="text-gray-300 mt-0.5">
                  {p.commonMistakes?.[0] || "—"}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type PracticeMode =
  | "pattern_drill"
  | "mixed"
  | "trap_training"
  | "recognition"
  | "decision"
  | "speed";

const PRACTICE_MODES: { id: PracticeMode; label: string; desc: string }[] = [
  { id: "pattern_drill", label: "Pattern Drill", desc: "One pattern at a time until solid" },
  { id: "mixed", label: "Mixed Practice", desc: "Random patterns to simulate exam" },
  { id: "trap_training", label: "Trap Training", desc: "Only questions where trap is active" },
  { id: "recognition", label: "Recognition Mode", desc: "Identify the pattern quickly" },
  { id: "decision", label: "Decision Mode", desc: "Choose the correct rule, not just the answer" },
  { id: "speed", label: "Speed Mode", desc: "30 s per question — build reflex" },
];

function PracticeTab({ subject }: { subject: Subject }) {
  const [selected, setSelected] = useState<PracticeMode>("pattern_drill");
  const { startSession } = useApexEngineStore();

  const handleStart = () => {
    startSession(
      selected === "mixed" ? "quick" : "pattern_drill",
      subject.id,
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">Choose a training mode, then start.</p>
      <div className="grid grid-cols-2 gap-2">
        {PRACTICE_MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setSelected(m.id)}
            className={`text-left p-3 rounded-lg border text-sm transition-colors ${
              selected === m.id
                ? `${subject.border} bg-white/10 text-white`
                : "border-gray-600/30 bg-black/20 text-gray-300 hover:bg-black/30"
            }`}
          >
            <div className="font-medium">{m.label}</div>
            <div className="text-xs text-gray-400 mt-0.5">{m.desc}</div>
          </button>
        ))}
      </div>
      <button
        onClick={handleStart}
        className={`w-full py-3 rounded-lg bg-gradient-to-r ${subject.colorFrom.replace("/20", "")} ${subject.colorTo.replace("/20", "")} text-white font-semibold text-sm transition-all hover:opacity-90`}
      >
        Start {PRACTICE_MODES.find((m) => m.id === selected)?.label}
      </button>
    </div>
  );
}

function GenerateTab({ subject }: { subject: Subject }) {
  const [datPlus, setDatPlus] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState<ReturnType<
    typeof generateQuestionForPattern
  > | null>(null);
  const [selectedPatternId, setSelectedPatternId] = useState<string>("");
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [revealed, setRevealed] = useState(false);
  const [timingStart, setTimingStart] = useState<number | null>(null);

  const { saveGeneratedQuestion, recordAttempt, patterns: storePatterns } = useApexEngineStore();

  const subjectPatterns = getPatternsByCategory(subject.category as never);
  const latestPatternId = selectedPatternId || subjectPatterns[0]?.id || "";

  const currentStorePattern = storePatterns.find((p) => p.section === subject.id && p.timesSeen > 0);
  const accuracy = currentStorePattern
    ? Math.round((currentStorePattern.timesCorrect / currentStorePattern.timesSeen) * 100)
    : 50;
  const difficulty = computeNextDifficulty(5, accuracy, 60, 50, datPlus);

  const handleGenerate = useCallback(() => {
    setGenerating(true);
    setSelectedAnswer("");
    setRevealed(false);
    setTimingStart(Date.now());
    const q = generateQuestionForPattern(latestPatternId, subject.id, difficulty, datPlus);
    setActiveQuestion(q);

    // Persist to question bank
    saveGeneratedQuestion({
      section: subject.id,
      patternId: latestPatternId,
      difficulty,
      datPlus,
      trapType: q.pdrm.trap,
      question: q.question,
      choices: q.choices,
      answer: q.answer,
      explanation: q.explanation,
      pdrm: q.pdrm,
    });
    setGenerating(false);
  }, [latestPatternId, subject.id, difficulty, datPlus, saveGeneratedQuestion]);

  const handleSubmit = () => {
    if (!selectedAnswer || !activeQuestion || !timingStart) return;
    const timeSeconds = Math.round((Date.now() - timingStart) / 1000);
    const correct = selectedAnswer === activeQuestion.answer;
    setRevealed(true);
    recordAttempt({
      questionId: `gen-${Date.now()}`,
      section: subject.id,
      patternId: latestPatternId,
      correct,
      selectedAnswer,
      timeSeconds,
      trapTriggered: !correct ? activeQuestion.pdrm.trap : undefined,
    });
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {subjectPatterns.slice(0, 4).map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPatternId(p.id)}
              className={`px-2 py-1 rounded text-xs border transition-colors ${
                (selectedPatternId || subjectPatterns[0]?.id) === p.id
                  ? `${subject.border} bg-white/10 text-white`
                  : "border-gray-600/30 text-gray-400 hover:text-white"
              }`}
            >
              {p.name.split(" ").slice(0, 2).join(" ")}
            </button>
          ))}
        </div>
        {/* DAT / DAT+ toggle */}
        <button
          onClick={() => setDatPlus((v) => !v)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            datPlus
              ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
              : "bg-black/20 border-gray-600/30 text-gray-400"
          }`}
        >
          {datPlus ? "DAT+" : "DAT"} Mode
        </button>
      </div>

      <button
        onClick={handleGenerate}
        disabled={generating}
        className={`w-full py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-sm transition-all ${generating ? "opacity-50" : ""}`}
      >
        {generating ? "Generating…" : "Generate Question"}
      </button>

      {/* Question */}
      {activeQuestion && (
        <div className="bg-black/30 rounded-lg p-4 border border-gray-600/30 space-y-3">
          <p className="text-sm text-white leading-relaxed">{activeQuestion.question}</p>

          <div className="space-y-2">
            {activeQuestion.choices.map((choice, i) => {
              const isCorrect = choice === activeQuestion.answer;
              const isSelected = choice === selectedAnswer;
              let cls = "border border-gray-600/30 bg-black/20 text-gray-300 hover:bg-white/10";
              if (revealed) {
                if (isCorrect) cls = "border border-emerald-500/50 bg-emerald-500/10 text-emerald-200";
                else if (isSelected && !isCorrect) cls = "border border-rose-500/50 bg-rose-500/10 text-rose-200";
                else cls = "border border-gray-600/20 bg-black/10 text-gray-500";
              } else if (isSelected) {
                cls = `${subject.border} bg-white/10 text-white`;
              }
              return (
                <button
                  key={i}
                  disabled={revealed}
                  onClick={() => setSelectedAnswer(choice)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${cls}`}
                >
                  {String.fromCharCode(65 + i)}. {choice}
                </button>
              );
            })}
          </div>

          {!revealed && selectedAnswer && (
            <button
              onClick={handleSubmit}
              className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
            >
              Submit Answer
            </button>
          )}

          {revealed && (
            <div className="bg-black/20 rounded-lg p-3 border border-gray-600/20 space-y-2">
              <p className="text-xs text-gray-300">{activeQuestion.explanation}</p>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <span className="text-purple-400">Pattern</span>
                  <p className="text-gray-400">{activeQuestion.pdrm.pattern}</p>
                </div>
                <div>
                  <span className="text-blue-400">Decision Rule</span>
                  <p className="text-gray-400">{activeQuestion.pdrm.decisionRule}</p>
                </div>
                <div>
                  <span className="text-rose-400">Trap</span>
                  <p className="text-gray-400">{activeQuestion.pdrm.trap}</p>
                </div>
              </div>
              <button
                onClick={handleGenerate}
                className="w-full py-1.5 rounded bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 text-xs transition-colors"
              >
                Generate Another
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewTab({ subject }: { subject: Subject }) {
  const { questionBank, mistakes } = useApexEngineStore();
  const subjectMistakes = mistakes.filter((m) => m.section === subject.id).slice(0, 10);
  const subjectAttempts = questionBank.attempts
    .filter((a) => a.section === subject.id)
    .slice(0, 20);
  const correct = subjectAttempts.filter((a) => a.correct).length;
  const accuracy = subjectAttempts.length
    ? Math.round((correct / subjectAttempts.length) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-black/20 rounded-lg p-3 border border-gray-600/30">
          <div className="text-lg font-bold text-white">{subjectAttempts.length}</div>
          <div className="text-xs text-gray-400">Attempted</div>
        </div>
        <div className="bg-black/20 rounded-lg p-3 border border-gray-600/30">
          <div className={`text-lg font-bold ${accuracy >= 70 ? "text-emerald-400" : accuracy >= 50 ? "text-yellow-400" : "text-rose-400"}`}>
            {accuracy}%
          </div>
          <div className="text-xs text-gray-400">Accuracy</div>
        </div>
        <div className="bg-black/20 rounded-lg p-3 border border-gray-600/30">
          <div className="text-lg font-bold text-rose-400">{subjectMistakes.length}</div>
          <div className="text-xs text-gray-400">Mistakes</div>
        </div>
      </div>

      {/* PDRM mistake breakdown */}
      {subjectMistakes.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
            PDRM Mistake Review
          </p>
          {subjectMistakes.map((m) => (
            <div key={m.id} className="bg-black/20 rounded-lg p-3 border border-rose-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-rose-300 font-medium">{m.reasonMissed.replace(/_/g, " ")}</span>
                <span className="text-[10px] text-gray-500">{m.createdAt.slice(0, 10)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-purple-400">Pattern</span>
                  <p className="text-gray-400 mt-0.5">{m.pdrm.pattern}</p>
                </div>
                <div>
                  <span className="text-blue-400">Decision Rule</span>
                  <p className="text-gray-400 mt-0.5">{m.pdrm.decisionRule}</p>
                </div>
                <div>
                  <span className="text-green-400">Reason</span>
                  <p className="text-gray-400 mt-0.5">{m.pdrm.reason}</p>
                </div>
                <div>
                  <span className="text-rose-400">Miss</span>
                  <p className="text-gray-400 mt-0.5">{m.pdrm.miss}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500 text-center py-4">
          No mistakes recorded yet. Complete practice to populate this section.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subject Panel
// ---------------------------------------------------------------------------

function SubjectPanel({ subject }: { subject: Subject }) {
  const [tab, setTab] = useState<TabId>("pdrm");
  const { patterns: storePatterns } = useApexEngineStore();
  const readinessForSubject = storePatterns
    .filter((p) => p.section === subject.id && p.timesSeen > 0)
    .reduce<number>((sum, p) => sum + p.readiness, 0);
  const patCount = storePatterns.filter(
    (p) => p.section === subject.id && p.timesSeen > 0,
  ).length;
  const avgReadiness = patCount ? Math.round(readinessForSubject / patCount) : 0;

  const tabs: { id: TabId; label: string }[] = [
    { id: "pdrm", label: "PDRM" },
    { id: "practice", label: "Practice" },
    { id: "generate", label: "Generate" },
    { id: "review", label: "Review" },
  ];

  return (
    <div
      className={`bg-gradient-to-br ${subject.colorFrom} ${subject.colorTo} rounded-xl border ${subject.border} p-5`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">{subject.emoji}</span>
          <h3 className={`font-semibold text-white`}>{subject.label}</h3>
        </div>
        {avgReadiness > 0 && (
          <div className="text-right">
            <div className={`text-sm font-bold ${avgReadiness >= 75 ? "text-emerald-400" : avgReadiness >= 50 ? "text-yellow-400" : "text-rose-400"}`}>
              {avgReadiness}%
            </div>
            <div className="text-[10px] text-gray-400">Readiness</div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 bg-black/20 rounded-lg p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === t.id
                ? "bg-white/20 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[200px]">
        {tab === "pdrm" && <PdrmTab subject={subject} />}
        {tab === "practice" && <PracticeTab subject={subject} />}
        {tab === "generate" && <GenerateTab subject={subject} />}
        {tab === "review" && <ReviewTab subject={subject} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function TrainingArena() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-black/30 backdrop-blur-sm rounded-xl border border-blue-500/20 overflow-hidden">
      {/* Header — always visible, toggles expansion */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between p-6 text-left hover:bg-white/5 transition-colors"
      >
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            🏟️ DAT Training Arena
          </h2>
          <p className="text-blue-200 text-sm mt-1">
            Biology · Gen Chem · Orgo · PAT · QR — PDRM → Practice → Generate → Review
          </p>
        </div>
        <span className="text-gray-400 text-sm">{expanded ? "▲ Collapse" : "▼ Open"}</span>
      </button>

      {expanded && (
        <div className="px-6 pb-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {SUBJECTS.map((s) => (
              <SubjectPanel key={s.id} subject={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
