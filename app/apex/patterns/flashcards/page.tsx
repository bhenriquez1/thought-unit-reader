"use client";

import Link from 'next/link';

export default function PatternFlashcardsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-900 flex items-center justify-center">
      <div className="max-w-md w-full mx-4 text-center">
        <div className="bg-black/30 backdrop-blur-sm rounded-xl p-10 border border-emerald-500/20">
          <div className="text-5xl mb-4">🃏</div>
          <h1 className="text-2xl font-bold text-white mb-2">Pattern Flashcards</h1>
          <p className="text-emerald-200 text-sm mb-6">
            Spaced-repetition flashcards for DAT patterns are coming soon. In the
            meantime, use the Pattern Browser to study rules and run interactive
            decision trees.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href="/apex/patterns"
              className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-90 text-white rounded-lg font-medium transition-opacity"
            >
              📖 Browse Pattern Rules
            </Link>
            <Link
              href="/apex"
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              ← Back to DAT Apex
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
