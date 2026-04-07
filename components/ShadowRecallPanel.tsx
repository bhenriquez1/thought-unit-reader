import React, { useEffect, useMemo, useState } from "react";
import type { PageStory } from "@/lib/insights/buildPageStory";

export default function ShadowRecallPanel({
  pageStory,
  pageTruthKey,
}: {
  pageStory: PageStory | null;
  pageTruthKey: string;
}) {
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const prompts = useMemo(() => pageStory?.shadowRecall.questions || [], [pageStory]);
  const reveal = useMemo(() => pageStory?.shadowRecall.reveal || null, [pageStory]);
  const semanticReveal = useMemo(() => {
    if (!pageStory) return null;
    return {
      main: pageStory.mainIdeaBlock?.text || reveal?.mainIdea || "",
      mechanism: pageStory.mechanismBlock?.text || reveal?.mechanism || "",
      distinction: pageStory.distinctionBlock?.text || reveal?.distinction || "",
      application: pageStory.decisionBlock?.action || pageStory.applicationBlock?.text || reveal?.application || "",
      trap: pageStory.trapBlock?.trap || reveal?.trap || "",
      wrongMove: pageStory.decisionBlock?.avoid[0] || pageStory.trapBlock?.whyWrong || "",
    };
  }, [pageStory, reveal]);

  useEffect(() => {
    setAnswer("");
    setRevealed(false);
  }, [pageTruthKey]);

  return (
    <div className="space-y-3 rounded-xl border border-indigo-300/30 bg-indigo-500/10 p-3">
      <h4 className="text-sm font-semibold text-indigo-100">Shadow Recall</h4>
      <div className="text-xs text-slate-200 space-y-1">
        {prompts.length ? prompts.map((prompt, idx) => <p key={idx}>• {prompt}</p>) : <p>• Waiting for current-page story...</p>}
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
      {revealed && semanticReveal && (
        <div className="space-y-2 text-xs">
          <p className="text-slate-200"><strong>Main idea:</strong> {semanticReveal.main || "—"}</p>
          <p className="text-slate-200"><strong>Mechanism:</strong> {semanticReveal.mechanism || "—"}</p>
          <p className="text-slate-200"><strong>Distinction:</strong> {semanticReveal.distinction || "—"}</p>
          <p className="text-slate-200"><strong>Application:</strong> {semanticReveal.application || "—"}</p>
          <p className="text-slate-200"><strong>Trap:</strong> {semanticReveal.trap || "—"}</p>
          <p className="text-amber-200"><strong>Avoid:</strong> {semanticReveal.wrongMove || "—"}</p>
        </div>
      )}
    </div>
  );
}
