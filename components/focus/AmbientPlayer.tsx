import React, { useEffect, useMemo, useState } from "react";

export type AmbientMode = "floating" | "docked" | "background";

function parseYoutubeToEmbed(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const videoId =
      host === "youtu.be"
        ? parsed.pathname.replace("/", "")
        : parsed.searchParams.get("v") || "";
    if (!videoId) return null;
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
  } catch {
    return null;
  }
}

export default function AmbientPlayer({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<AmbientMode>("floating");
  const [compact, setCompact] = useState(false);
  const [opacity, setOpacity] = useState(0.92);
  const embedUrl = useMemo(() => parseYoutubeToEmbed(url), [url]);

  useEffect(() => {
    const storedMode = localStorage.getItem("avrrio-ambient-mode") as AmbientMode | null;
    const storedOpacity = Number(localStorage.getItem("avrrio-ambient-opacity"));
    if (storedMode) setMode(storedMode);
    if (Number.isFinite(storedOpacity) && storedOpacity > 0) setOpacity(storedOpacity);
  }, []);

  useEffect(() => {
    localStorage.setItem("avrrio-ambient-mode", mode);
    localStorage.setItem("avrrio-ambient-opacity", String(opacity));
  }, [mode, opacity]);

  if (!embedUrl) return null;

  return (
    <div
      className={`fixed z-40 rounded-xl border border-emerald-300/30 bg-slate-950/95 p-2 shadow-2xl ${
        mode === "docked" ? "bottom-4 right-[380px]" : "bottom-6 right-6"
      }`}
      style={{ opacity }}
    >
      <div className="mb-2 flex items-center gap-2 text-xs text-emerald-100">
        <span>Ambient</span>
        <select value={mode} onChange={(e) => setMode(e.target.value as AmbientMode)} className="rounded bg-slate-800 px-1 py-0.5">
          <option value="floating">Floating</option>
          <option value="docked">Docked</option>
          <option value="background">Background</option>
        </select>
        <button className="rounded bg-slate-800 px-2 py-0.5" onClick={() => setCompact((v) => !v)}>
          {compact ? "Expand" : "Minimize"}
        </button>
        <button className="rounded bg-slate-800 px-2 py-0.5" onClick={onClose}>Close</button>
      </div>
      <input type="range" min={0.35} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="mb-2 w-full" />
      {mode !== "background" && !compact ? (
        <iframe title="Ambient video" src={embedUrl} className="h-44 w-72 rounded-lg" allow="autoplay; encrypted-media" allowFullScreen />
      ) : (
        <div className="rounded bg-slate-900 px-2 py-1 text-xs text-slate-300">Background audio active</div>
      )}
    </div>
  );
}
