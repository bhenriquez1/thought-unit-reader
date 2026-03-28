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
  const [compact, setCompact] = useState(true);
  const [opacity, setOpacity] = useState(0.92);
  const [position, setPosition] = useState({ x: 24, y: 24 });
  const [dragging, setDragging] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const embedUrl = useMemo(() => parseYoutubeToEmbed(url), [url]);

  useEffect(() => {
    const storedMode = localStorage.getItem("avrrio-ambient-mode") as AmbientMode | null;
    const storedOpacity = Number(localStorage.getItem("avrrio-ambient-opacity"));
    const storedPos = localStorage.getItem("avrrio-ambient-position");
    if (storedMode) setMode(storedMode);
    if (Number.isFinite(storedOpacity) && storedOpacity > 0) setOpacity(storedOpacity);
    if (storedPos) {
      try {
        const parsed = JSON.parse(storedPos);
        if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) setPosition(parsed);
      } catch {
        // ignore parse failure
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("avrrio-ambient-mode", mode);
    localStorage.setItem("avrrio-ambient-opacity", String(opacity));
    localStorage.setItem("avrrio-ambient-position", JSON.stringify(position));
  }, [mode, opacity, position]);

  useEffect(() => {
    setInvalid(!embedUrl);
  }, [embedUrl]);

  useEffect(() => {
    const onMove = (ev: MouseEvent) => {
      if (!dragging || mode !== "floating") return;
      setPosition((prev) => ({ x: Math.max(8, prev.x - ev.movementX), y: Math.max(8, prev.y - ev.movementY) }));
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, mode]);

  return (
    <div
      className={`fixed z-40 rounded-xl border border-emerald-300/30 bg-slate-950/95 p-2 shadow-2xl ${
        mode === "docked" ? "bottom-4 right-[380px]" : "bottom-6 right-6"
      }`}
      style={mode === "floating" ? { opacity, right: position.x, bottom: position.y } : { opacity }}
    >
      <div className="mb-2 flex items-center gap-2 text-xs text-emerald-100" onMouseDown={() => setDragging(true)}>
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
      {invalid ? (
        <div className="rounded bg-rose-900/40 px-2 py-2 text-xs text-rose-200">Invalid ambient link</div>
      ) : mode !== "background" && !compact && embedUrl ? (
        <iframe title="Ambient video" src={embedUrl} className="h-44 w-72 rounded-lg" allow="autoplay; encrypted-media" allowFullScreen />
      ) : (
        <div className="rounded bg-slate-900 px-2 py-1 text-xs text-slate-300">Background audio active</div>
      )}
    </div>
  );
}
