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
  const reveal = useMemo(() => {
    if (!pageStory) return null;
    return {
      mainIdea: pageStory.mainIdeaBlock?.text || pageStory.shadowRecall.reveal.mainIdea,
      mechanism: pageStory.mechanismBlock?.text || pageStory.shadowRecall.reveal.mechanism,
      distinction: pageStory.distinctionBlock?.text || pageStory.shadowRecall.reveal.distinction,
      application: pageStory.applicationBlock?.text || pageStory.shadowRecall.reveal.application,
      trap: pageStory.trapBlock?.text || pageStory.shadowRecall.reveal.trap,
    };
  }, [pageStory]);

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
      {revealed && reveal && (
        <div className="space-y-2 text-xs">
          <p className="text-slate-200"><strong>Main idea:</strong> {reveal.mainIdea || "—"}</p>
          <p className="text-slate-200"><strong>Mechanism:</strong> {reveal.mechanism || "—"}</p>
          <p className="text-slate-200"><strong>Distinction:</strong> {reveal.distinction || "—"}</p>
          <p className="text-slate-200"><strong>Application:</strong> {reveal.application || "—"}</p>
          <p className="text-slate-200"><strong>Trap:</strong> {reveal.trap || "—"}</p>
        </div>
      )}
    </div>
  );
}
