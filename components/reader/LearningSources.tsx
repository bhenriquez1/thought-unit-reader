import React, { useState } from "react";

type ResolvedArticle = {
  title: string;
  url: string;
  source: string;
  reason: string;
  score: number;
};

type ResolvedVideo = {
  channel: string;
  channelHandle: string;
  videoTitle: string;
  searchUrl: string;
  isVerified?: boolean;
  reason: string;
  timestampSeconds: number | null;
  timestampLabel: string | null;
  score: number;
};

interface LearningSourcesProps {
  hasSynth: boolean;
  resolvedResources: { resolved: boolean; articles: ResolvedArticle[]; videos: ResolvedVideo[] };
  exactArticles: ResolvedArticle[];
  exactVideos: ResolvedVideo[];
  cohereQueries: { readings: string[]; videos: string[] } | null;
  surgeonTypeLabel?: string | null;
  activeConceptTitle?: string | null;
}

function getQualityLabel(source: string): string {
  const s = source?.toLowerCase() ?? "";
  if (s.includes("pubmed") || s.includes("ncbi") || s.includes("nih")) return "Peer-reviewed";
  if (s.includes("openstax") || s.includes("university") || s.includes(".edu")) return "University source";
  if (s.includes("khanacademy") || s.includes("youtube") || s.includes("educational")) return "Educational source";
  return "Educational source";
}

export default function LearningSources({
  hasSynth,
  resolvedResources,
  exactArticles,
  exactVideos,
  cohereQueries,
  surgeonTypeLabel,
}: LearningSourcesProps) {
  const [showAddForm, setShowAddForm] = useState(false);

  if (!hasSynth) return null;

  const hasCohereFallback =
    resolvedResources.resolved &&
    (
      (resolvedResources.articles.length === 0 && (cohereQueries?.readings?.length ?? 0) > 0) ||
      (resolvedResources.videos.length === 0 && (cohereQueries?.videos?.length ?? 0) > 0)
    );

  return (
    <div className="border-t border-white/8">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/8">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
          Learning Sources
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            + Add My Source
          </button>
          <button
            className="text-[10px] px-2 py-0.5 rounded bg-indigo-900/60 hover:bg-indigo-800/60 text-indigo-300 transition-colors"
            disabled
            title="AI-powered source search — coming soon"
          >
            ✨ Find a Source
          </button>
        </div>
      </div>

      {/* Add source form */}
      {showAddForm && (
        <div className="p-3 border-b border-white/8">
          <div className="text-[10px] text-slate-400 mb-2">Attach your own source</div>
          <div className="flex flex-col gap-2">
            <select className="text-xs rounded border border-slate-700 bg-slate-800 text-slate-200 px-2 py-1.5">
              <option value="">Select source type…</option>
              <option value="url">Webpage URL</option>
              <option value="youtube">YouTube / Vimeo URL</option>
              <option value="pdf">PDF or Article</option>
              <option value="audio">Audio or Lecture</option>
              <option value="library">From My Library</option>
            </select>
            <input
              type="text"
              placeholder="Paste URL or title…"
              className="text-xs rounded border border-slate-700 bg-slate-800 text-slate-200 px-2 py-1.5"
            />
            <div className="text-[10px] text-slate-600 italic">
              Source management is in development — your sources will be saved to Workspace in a future update.
            </div>
            <button
              onClick={() => setShowAddForm(false)}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {!resolvedResources.resolved && (
        <div className="px-3 py-3">
          <p className="text-[12px] text-slate-500 italic">Finding resources…</p>
        </div>
      )}

      {/* Sources list */}
      {resolvedResources.resolved && (exactArticles.length > 0 || exactVideos.length > 0) && (
        <ul className="space-y-2 px-3 py-3">
          {/* Articles */}
          {exactArticles.map((a, i) => (
            <li key={`article-${i}`} className="rounded-lg border border-white/8 bg-white/3 p-2.5">
              <div className="flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[12px] font-medium text-violet-200 leading-snug">{a.title}</span>
                  <span className="shrink-0 rounded bg-violet-900/40 px-1.5 py-0.5 text-[9px] font-semibold text-violet-400">
                    {getQualityLabel(a.source)}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">{a.source}</span>
                {surgeonTypeLabel && (
                  <span className="text-[9.5px] font-semibold text-emerald-400/80">Supports: {surgeonTypeLabel}</span>
                )}
                {a.reason && (
                  <p className="text-[11px] text-slate-300 italic mt-0.5">{a.reason}</p>
                )}
                <div className="mt-1">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded bg-violet-800/50 hover:bg-violet-700/60 px-2.5 py-1 text-[11px] font-semibold text-violet-100 transition-colors"
                    onClick={() =>
                      console.log("[RELATED_CLICK_TARGET]", { type: "article", title: a.title, url: a.url, source: a.source })
                    }
                  >
                    Open ↗
                  </a>
                </div>
              </div>
            </li>
          ))}

          {/* Videos */}
          {exactVideos.map((v, i) => {
            const isDirectVideo = v.searchUrl.includes("youtube.com/watch?v=");
            const hasTimestamp = isDirectVideo && v.timestampSeconds != null && v.timestampSeconds > 0;
            const watchUrl =
              hasTimestamp && v.timestampSeconds
                ? (() => {
                    try {
                      const u = new URL(v.searchUrl);
                      u.searchParams.set("t", `${Math.floor(v.timestampSeconds)}s`);
                      return u.toString();
                    } catch {
                      return v.searchUrl;
                    }
                  })()
                : v.searchUrl;

            return (
              <li key={`video-${i}`} className="rounded-lg border border-white/10 bg-white/4 p-2.5">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[12px] font-semibold text-red-100 leading-snug">{v.videoTitle}</span>
                    <span className="shrink-0 rounded bg-red-900/40 px-1.5 py-0.5 text-[9px] font-semibold text-red-300">
                      Educational source
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-medium text-slate-300">{v.channel}</span>
                    {surgeonTypeLabel && (
                      <span className="text-[9.5px] font-semibold text-emerald-400/80">Supports: {surgeonTypeLabel}</span>
                    )}
                    {isDirectVideo ? (
                      <span className="rounded bg-emerald-900/50 px-1 py-px text-[9px] font-semibold text-emerald-400">
                        ▶ verified
                      </span>
                    ) : (
                      <span className="rounded bg-slate-700/60 px-1 py-px text-[9px] text-slate-400">search</span>
                    )}
                  </div>
                  {v.reason && (
                    <p className="text-[11px] text-slate-400 italic leading-snug">{v.reason}</p>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    {hasTimestamp && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                        ⏱ {v.timestampLabel}
                      </span>
                    )}
                    <a
                      href={watchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto inline-flex items-center gap-1 rounded bg-red-700 hover:bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors"
                      onClick={() =>
                        console.log("[RELATED_CLICK_TARGET]", {
                          type: "video",
                          title: v.videoTitle,
                          url: watchUrl,
                          channel: v.channel,
                          isVerified: v.isVerified ?? isDirectVideo,
                          hasTimestamp,
                        })
                      }
                    >
                      {v.isVerified ?? isDirectVideo
                        ? `▶ Watch${hasTimestamp ? " at timestamp" : ""}`
                        : "🔍 Search YouTube"}
                    </a>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Empty state when resolved but nothing found */}
      {resolvedResources.resolved && exactArticles.length === 0 && exactVideos.length === 0 && !hasCohereFallback && (
        <div className="px-3 py-3">
          <p className="text-[12px] text-slate-500 italic">No exact matches found for this page.</p>
        </div>
      )}

      {/* Cohere fallback — broad search starting points */}
      {hasCohereFallback && (
        <div className="px-3 py-3 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-slate-500">
            Broad Search (no exact match found)
          </p>
          {resolvedResources.articles.length === 0 && (cohereQueries?.readings?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400/70 mb-1.5">Readings</p>
              <div className="flex flex-wrap gap-1.5">
                {cohereQueries!.readings.map((q, i) => (
                  <a
                    key={i}
                    href={`https://www.google.com/search?q=${encodeURIComponent(q)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-violet-500/30 bg-violet-900/20 px-2.5 py-1 text-[11px] text-violet-200 hover:bg-violet-800/40 transition-colors"
                  >
                    {q}
                  </a>
                ))}
              </div>
            </div>
          )}
          {resolvedResources.videos.length === 0 && (cohereQueries?.videos?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-400/70 mb-1.5">Videos</p>
              <div className="flex flex-wrap gap-1.5">
                {cohereQueries!.videos.map((q, i) => (
                  <a
                    key={i}
                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-red-500/30 bg-red-900/20 px-2.5 py-1 text-[11px] text-red-200 hover:bg-red-800/40 transition-colors"
                  >
                    ▶ {q}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
