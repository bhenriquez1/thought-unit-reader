import React from "react";

interface UnderConstructionPanelProps {
  icon: string;
  title: string;
  subtitle: string;
  bullets: string[];
  ctaLabel?: string;
}

export default function UnderConstructionPanel({ icon, title, subtitle, bullets, ctaLabel = "Coming Soon" }: UnderConstructionPanelProps) {
  return (
    <div className="h-full w-full p-6 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white overflow-auto">
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/15 bg-white/5 p-8 backdrop-blur-xl shadow-[0_0_40px_rgba(99,102,241,0.18)]">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-indigo-500/20 grid place-items-center text-2xl animate-pulse">{icon}</div>
          <div>
            <h2 className="text-2xl font-bold">{title}</h2>
            <p className="text-slate-300">{subtitle}</p>
          </div>
        </div>
        <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {bullets.map((item) => (
            <li key={item} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200">{item}</li>
          ))}
        </ul>
        <button
          disabled
          className="mt-6 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-300 cursor-not-allowed"
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
