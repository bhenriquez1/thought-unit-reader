"use client";
// components/apex/TrainingArena.tsx
// DAT Training Arena — Learn → Practice → Generate → Review
// Each subject panel: Learn (PDRM accordion) | Practice | Generate | Review

import React, { useState, useCallback } from "react";
import { useApexEngineStore } from "@/lib/stores/apexEngineStore";
import { DAT_PATTERN_MODULES, PatSubtype, getModulesBySection } from "@/lib/apex/datApex.seed";
import { generateNextQuestion, scaleDifficulty, type GeneratorMode, type GeneratorDifficulty, type GeneratorProfile } from "@/lib/apex/datApex.generator";
import type { ApexSection } from "@/lib/apex/datApexTypes";

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
    category: "qr",
    colorFrom: "from-pink-600/20",
    colorTo: "to-rose-600/20",
    border: "border-pink-500/30",
    textAccent: "text-pink-300",
  },
  {
    id: "rc",
    label: "Reading",
    emoji: "📖",
    category: "rc",
    colorFrom: "from-teal-600/20",
    colorTo: "to-cyan-600/20",
    border: "border-teal-500/30",
    textAccent: "text-teal-300",
  },
];

type TabId = "learn" | "practice" | "generate" | "review";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LearnTab({ subject }: { subject: Subject }) {
  const modules = getModulesBySection(subject.id as ApexSection);
  const storePatterns = useApexEngineStore((s) =>
    s.patterns.filter((p) => p.section === subject.id),
  );
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400 mb-3">
        Pattern → Decision Rule → Mechanism → Trap. Open each to study before you practice.
      </p>
      {modules.map((m) => {
        const stored = storePatterns.find((p) => p.id === m.id);
        const isOpen = openId === m.id;
        return (
          <div key={m.id} className="rounded-lg border border-gray-600/30 overflow-hidden">
            <button
              onClick={() => setOpenId(isOpen ? null : m.id)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-black/20 hover:bg-black/30 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{m.name}</span>
                {m.patSubtype && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-400 uppercase">
                    {m.patSubtype.replace("_", " ")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {stored && stored.masteryLevel !== "unseen" && stored.timesSeen > 0 && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    stored.masteryLevel === "mastered" ? "bg-emerald-500/20 text-emerald-300"
                      : stored.masteryLevel === "strong" ? "bg-green-500/20 text-green-300"
                      : stored.masteryLevel === "unstable" ? "bg-yellow-500/20 text-yellow-300"
                      : "bg-gray-500/20 text-gray-400"
                  }`}>{stored.masteryLevel}</span>
                )}
                <span className="text-gray-500 text-xs">{isOpen ? "▲" : "▼"}</span>
              </div>
            </button>
            {isOpen && (
              <div className="p-3 bg-black/10 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-purple-400 font-medium">Pattern</span>
                  <p className="text-gray-300 mt-1 leading-relaxed">{m.pattern}</p>
                </div>
                <div>
                  <span className="text-blue-400 font-medium">Decision Rule</span>
                  <p className="text-gray-300 mt-1 leading-relaxed">{m.decisionRule}</p>
                </div>
                <div>
                  <span className="text-green-400 font-medium">Mechanism</span>
                  <p className="text-gray-300 mt-1 leading-relaxed">{m.mechanism}</p>
                </div>
                <div>
                  <span className="text-rose-400 font-medium">Trap</span>
                  <p className="text-gray-300 mt-1 leading-relaxed">{m.trap}</p>
                </div>
              </div>
            )}
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

const PAT_SUBTYPES: { id: PatSubtype; label: string }[] = [
  { id: "keyhole",       label: "Keyhole" },
  { id: "angle_ranking", label: "Angles" },
  { id: "cube_counting", label: "Cubes" },
  { id: "paper_folding", label: "Paper" },
  { id: "tfe",           label: "TFE" },
];

function GenerateTab({ subject }: { subject: Subject }) {
  const [datPlus, setDatPlus] = useState(false);
  const [mode, setMode] = useState<GeneratorMode>("pattern_drill");
  const [generating, setGenerating] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState<import("@/lib/apex/datApexTypes").GeneratedQuestion | null>(null);
  const [selectedPatternId, setSelectedPatternId] = useState<string>("");
  const [patSubtype, setPatSubtype] = useState<PatSubtype>("keyhole");
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [revealed, setRevealed] = useState(false);
  const [timingStart, setTimingStart] = useState<number | null>(null);

  const { saveGeneratedQuestion, recordAttempt, patterns: storePatterns } = useApexEngineStore();

  const subjectModules = getModulesBySection(subject.id as ApexSection);
  const latestPatternId = selectedPatternId || subjectModules[0]?.id || "";

  const currentStorePattern = storePatterns.find((p) => p.section === subject.id && p.timesSeen > 0);
  const accuracy = currentStorePattern && currentStorePattern.timesSeen > 0
    ? currentStorePattern.timesCorrect / currentStorePattern.timesSeen
    : 0.5;
  const difficulty = scaleDifficulty(5, { accuracy, datPlus }) as GeneratorDifficulty;

  const handleGenerate = useCallback(() => {
    setGenerating(true);
    setSelectedAnswer("");
    setRevealed(false);
    setTimingStart(Date.now());

    const profile: GeneratorProfile = {
      section: subject.id as ApexSection,
      mode,
      difficulty,
      datPlus,
      targetPatternIds: latestPatternId ? [latestPatternId] : undefined,
      patSubtype: subject.id === "pat" ? patSubtype : undefined,
    };
    const q = generateNextQuestion(profile);
    setActiveQuestion(q);

    saveGeneratedQuestion({
      section: subject.id as ApexSection,
      patternId: latestPatternId || q.patternId,
      difficulty,
      datPlus,
      trapType: q.trapType,
      question: q.question,
      choices: q.choices,
      answer: q.answer,
      explanation: q.explanation,
      pdrm: q.pdrm,
    });
    setGenerating(false);
  }, [latestPatternId, subject.id, difficulty, datPlus, mode, patSubtype, saveGeneratedQuestion]);

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
      {/* PAT subtype selector */}
      {subject.id === "pat" && (
        <div className="flex flex-wrap gap-1.5">
          {PAT_SUBTYPES.map((s) => (
            <button
              key={s.id}
              onClick={() => setPatSubtype(s.id)}
              className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                patSubtype === s.id
                  ? `${subject.border} bg-white/10 text-white`
                  : "border-gray-600/30 text-gray-400 hover:text-white"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Mode + pattern selector row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {subjectModules.slice(0, subject.id === "pat" ? 0 : 4).map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedPatternId(m.id)}
              className={`px-2 py-1 rounded text-xs border transition-colors ${
                (selectedPatternId || subjectModules[0]?.id) === m.id
                  ? `${subject.border} bg-white/10 text-white`
                  : "border-gray-600/30 text-gray-400 hover:text-white"
              }`}
            >
              {m.name.split(" ").slice(0, 2).join(" ")}
            </button>
          ))}
        </div>
        <button
          onClick={() => setDatPlus((v) => !v)}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            datPlus
              ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
              : "bg-black/20 border-gray-600/30 text-gray-400"
          }`}
        >
          {datPlus ? "DAT+" : "DAT"}
        </button>
      </div>

      {/* Mode selector */}
      <div className="flex flex-wrap gap-1.5">
        {(["pattern_drill", "trap_training", "decision", "recognition"] as GeneratorMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-2 py-1 rounded text-[11px] border transition-colors ${
              mode === m
                ? `${subject.border} bg-white/10 text-white`
                : "border-gray-600/30 text-gray-500 hover:text-gray-300"
            }`}
          >
            {m.replace("_", " ")}
          </button>
        ))}
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
  const [tab, setTab] = useState<TabId>("learn");
  const { patterns: storePatterns } = useApexEngineStore();
  const readinessForSubject = storePatterns
    .filter((p) => p.section === subject.id && p.timesSeen > 0)
    .reduce<number>((sum, p) => sum + p.readiness, 0);
  const patCount = storePatterns.filter(
    (p) => p.section === subject.id && p.timesSeen > 0,
  ).length;
  const avgReadiness = patCount ? Math.round(readinessForSubject / patCount) : 0;

  const tabs: { id: TabId; label: string }[] = [
    { id: "learn", label: "Learn" },
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
        {tab === "learn" && <LearnTab subject={subject} />}
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
            Bio · GC · Orgo · PAT · QR · RC — Learn → Practice → Generate → Review
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
