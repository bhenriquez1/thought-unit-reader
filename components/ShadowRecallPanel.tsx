import React, { useMemo, useState } from "react";
import type { PageSignals } from "@/lib/readerContracts";

interface ShadowRecallResult {
  recalledConcepts: string[];
  missedConcepts: string[];
  recalledTraps: string[];
  missedTraps: string[];
  recallScore: number;
  feedback: string[];
}

function evaluateRecall(answer: string, signals: PageSignals): ShadowRecallResult {
  const tokens = new Set(answer.toLowerCase().split(/\W+/).filter((t) => t.length > 3));
  const ranked = (signals.paragraphSignals || []).slice().sort((a, b) => b.examSignalScore - a.examSignalScore);
  const evidence = ranked.map((entry) => entry.text);
  const concepts = evidence.slice(0, 5);
  const recalledConcepts = concepts.filter((line) => line.toLowerCase().split(/\W+/).some((token) => tokens.has(token)));
  const missedConcepts = concepts.filter((line) => !recalledConcepts.includes(line));
  const traps = ranked.filter((entry) => entry.trapScore > 0 || entry.distinctionScore > 0).map((entry) => entry.text).slice(0, 3);
  const recalledTraps = traps.filter((line) => line.toLowerCase().split(/\W+/).some((token) => tokens.has(token)));
  const missedTraps = traps.filter((line) => !recalledTraps.includes(line));
  const possible = Math.max(1, concepts.length + traps.length);
  const recallScore = Math.round(((recalledConcepts.length + recalledTraps.length) / possible) * 100);
  return {
    recalledConcepts,
    missedConcepts,
    recalledTraps,
    missedTraps,
    recallScore,
    feedback: [
      recalledConcepts.length ? "Strong concept recall detected." : "Concept recall is shallow.",
      missedTraps.length ? "Review missed traps before moving on." : "Trap recall is solid.",
    ],
  };
}

export default function ShadowRecallPanel({
  signals,
  limitedEvidence,
}: {
  signals: PageSignals;
  limitedEvidence: boolean;
}) {
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const result = useMemo(() => evaluateRecall(answer, signals), [answer, signals]);

  return (
    <div className="space-y-3 rounded-xl border border-indigo-300/30 bg-indigo-500/10 p-3">
      <h4 className="text-sm font-semibold text-indigo-100">Shadow Recall</h4>
      {limitedEvidence ? <p className="text-xs text-amber-200">Limited evidence on this page. Recall mode is conservative.</p> : null}
      <div className="text-xs text-slate-200 space-y-1">
        <p>• What is the key concept on this page?</p>
        <p>• What is the mechanism or logic?</p>
        <p>• What distinction matters here?</p>
        <p>• What would they test or ask?</p>
        <p>• What trap would catch a student here?</p>
      </div>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        className="w-full rounded bg-slate-900/70 p-2 text-sm text-white"
        rows={4}
        placeholder="Type your recall answer…"
      />
      <button className="rounded bg-indigo-600 px-3 py-1 text-xs hover:bg-indigo-500" onClick={() => setRevealed(true)}>
        Reveal
      </button>
      {revealed && (
        <div className="space-y-2 text-xs">
          <p className="text-emerald-200">Recall Score: {result.recallScore}%</p>
          <p className="text-slate-200">Recalled concepts: {result.recalledConcepts.length || 0}</p>
          <p className="text-slate-200">Missed signals: {result.missedConcepts.length || 0}</p>
          <p className="text-slate-200">Missed traps: {result.missedTraps.length || 0}</p>
          <p className="text-slate-200">Fast recall cues: {(signals.paragraphSignals || []).slice(0, 2).map((entry) => entry.text.slice(0, 45)).join(" • ") || "None"}</p>
          {result.feedback.map((line, idx) => (
            <p key={idx} className="text-slate-300">{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}
