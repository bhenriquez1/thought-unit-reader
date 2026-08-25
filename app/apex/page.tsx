"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ErrorBoundary from "@/components/ErrorBoundary";
import { getUserBookCatalogue, type CatalogueBook } from "@/lib/apex/bookCatalogue";
import { getCurrentApexUserId } from "@/lib/apex/currentApexUserId";
import { listAttempts, loadReadinessState } from "@/lib/datApex/idbStore";
import type { DatAttempt, DatReadinessState } from "@/lib/datApex/types";
import { EXAM_PROFILE_CATALOG, type ExamProfileCatalogEntry } from "@/lib/examEngine/profiles/profileCatalog";
import { DAT_EXAM_PROFILE_ID } from "@/lib/examEngine/profiles/datProfile";

const ACTIVE_PROFILE_STORAGE_KEY = "avrrio:testlab:activeProfileId";

function readStoredProfile(): string {
  try {
    const stored = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
    return stored && EXAM_PROFILE_CATALOG.some((profile) => profile.id === stored && profile.available)
      ? stored
      : DAT_EXAM_PROFILE_ID;
  } catch {
    return DAT_EXAM_PROFILE_ID;
  }
}

function buildGeneratorUrl(profileId: string, bookId?: string, mode?: "practice" | "simulation"): string {
  const params = new URLSearchParams({ examType: profileId });
  if (bookId) params.set("sourceBookId", bookId);
  if (mode) params.set("mode", mode === "practice" ? "quick" : "full");
  return `/apex/generator?${params.toString()}`;
}

function ProfileCard({ profile, selected, onSelect }: { profile: ExamProfileCatalogEntry; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      disabled={!profile.available}
      onClick={() => profile.available && onSelect(profile.id)}
      aria-pressed={selected}
      className={`rounded-2xl border p-4 text-left transition-all ${selected ? "border-cyan-400 bg-cyan-400/10 ring-1 ring-cyan-300/30" : profile.available ? "border-white/10 bg-white/[0.035] hover:border-white/25 hover:bg-white/[0.06]" : "border-white/5 bg-white/[0.02] opacity-55 cursor-not-allowed"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-white">{profile.label}</div>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">{profile.description}</p>
        </div>
        {selected && <span className="text-cyan-300" aria-hidden="true">✓</span>}
        {!profile.available && <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-slate-400">Coming soon</span>}
      </div>
    </button>
  );
}

function SourceCard({ book, selected, onSelect }: { book: CatalogueBook; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} className={`w-full rounded-2xl border p-4 text-left transition-all ${selected ? "border-violet-400 bg-violet-400/10 ring-1 ring-violet-300/30" : "border-white/10 bg-white/[0.035] hover:border-white/25"}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden="true">📘</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-white">{book.bookTitle}</div>
          <div className="mt-1 text-xs text-slate-400">{book.noteCount} grounded page note{book.noteCount === 1 ? "" : "s"}</div>
        </div>
        {selected && <span className="text-violet-300" aria-hidden="true">✓</span>}
      </div>
    </button>
  );
}

function TestLabWorkspace() {
  const router = useRouter();
  const [profileId, setProfileId] = useState(readStoredProfile);
  const [books, setBooks] = useState<CatalogueBook[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [booksError, setBooksError] = useState<string | null>(null);
  const [selectedBookId, setSelectedBookId] = useState("");
  const [attempts, setAttempts] = useState<DatAttempt[]>([]);
  const [readiness, setReadiness] = useState<DatReadinessState | null>(null);

  const loadWorkspace = useCallback(async () => {
    setBooksLoading(true);
    setBooksError(null);
    try {
      const [catalogue, savedAttempts, savedReadiness] = await Promise.all([
        getUserBookCatalogue(),
        listAttempts(),
        loadReadinessState(getCurrentApexUserId()),
      ]);
      setBooks(catalogue);
      setAttempts(savedAttempts);
      setReadiness(savedReadiness);
      setSelectedBookId((current) => current || catalogue[0]?.bookId || "");
    } catch {
      setBooksError("TestLab could not load your saved sources. Your Reader data was not changed.");
    } finally {
      setBooksLoading(false);
    }
  }, []);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  const selectedBook = useMemo(() => books.find((book) => book.bookId === selectedBookId) ?? null, [books, selectedBookId]);

  const chooseProfile = useCallback((id: string) => {
    setProfileId(id);
    try { localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, id); } catch { /* preference write is non-fatal */ }
  }, []);

  const openBuilder = useCallback((mode?: "practice" | "simulation") => {
    router.push(buildGeneratorUrl(profileId, selectedBookId || undefined, mode));
  }, [profileId, selectedBookId, router]);

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_15%_0%,rgba(6,182,212,0.18),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(124,58,237,0.14),transparent_32%),linear-gradient(145deg,#020617,#0b1120_48%,#111827)] text-white">
      <header className="border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400/15 text-xl">🧪</span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Avrrio TestLab</h1>
              <p className="text-xs text-slate-400">Grounded tests from the books you study</p>
            </div>
          </div>
          <Link href="/" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10">← Avrrio Reader</Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Build from evidence</p>
          <h2 className="mt-2 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">Turn your uploaded material into a real practice test.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">Choose the exam purpose and source. TestLab uses grounded Reader material—never a generic substitute or a fake successful result.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-3xl border border-white/10 bg-slate-950/45 p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Step 1</div><h3 className="mt-1 text-lg font-semibold">What are you preparing for?</h3></div>
              <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">{EXAM_PROFILE_CATALOG.find((p) => p.id === profileId)?.label}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">{EXAM_PROFILE_CATALOG.map((profile) => <ProfileCard key={profile.id} profile={profile} selected={profile.id === profileId} onSelect={chooseProfile} />)}</div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-slate-950/45 p-5 sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div><div className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">Step 2</div><h3 className="mt-1 text-lg font-semibold">Choose your source</h3></div>
              <Link href="/" className="rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10">+ Add in Reader</Link>
            </div>
            {booksLoading && <div className="rounded-2xl border border-white/10 p-6 text-center text-sm text-slate-400">Loading your Reader sources…</div>}
            {booksError && <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-200"><p>{booksError}</p><button type="button" onClick={() => void loadWorkspace()} className="mt-3 rounded-lg bg-rose-300/15 px-3 py-2 font-semibold">Retry</button></div>}
            {!booksLoading && !booksError && books.length === 0 && (
              <div className="rounded-2xl border border-dashed border-violet-300/25 bg-violet-400/5 p-7 text-center">
                <div className="text-3xl">📚</div><h4 className="mt-3 font-semibold">Add a source in Avrrio Reader first</h4>
                <p className="mt-2 text-sm text-slate-400">Open a PDF and study a few pages so TestLab has grounded evidence to use.</p>
                <Link href="/" className="mt-4 inline-flex rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold hover:bg-violet-400">Open Reader</Link>
              </div>
            )}
            {!booksLoading && books.length > 0 && <div className="max-h-80 space-y-3 overflow-y-auto pr-1">{books.map((book) => <SourceCard key={book.bookId} book={book} selected={book.bookId === selectedBookId} onSelect={() => setSelectedBookId(book.bookId)} />)}</div>}
          </section>
        </div>

        <section className="mt-6 rounded-3xl border border-white/10 bg-gradient-to-r from-cyan-500/10 via-slate-950/50 to-violet-500/10 p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div><div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">Step 3</div><h3 className="mt-1 text-lg font-semibold">Configure the test</h3><p className="mt-1 text-sm text-slate-400">{selectedBook ? `Using “${selectedBook.bookTitle}”` : "Choose a grounded source to continue."}</p></div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" disabled={!selectedBook} onClick={() => openBuilder("practice")} className="rounded-xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40">Build Practice Test</button>
              <button type="button" disabled={!selectedBook} onClick={() => openBuilder("simulation")} className="rounded-xl border border-violet-300/30 bg-violet-400/10 px-5 py-3 text-sm font-semibold text-violet-100 hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-40">Configure Simulation</button>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <Link href="/apex/review" className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 hover:bg-white/[0.06]"><div className="text-sm font-semibold">Review mistakes</div><p className="mt-2 text-xs text-slate-400">Repair misconceptions and return to exact source evidence.</p></Link>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><div className="flex items-center justify-between"><span className="text-sm font-semibold">Readiness</span><span className="text-xs text-emerald-300">{readiness?.overallBand ?? "Not enough evidence"}</span></div><p className="mt-2 text-xs text-slate-400">{readiness ? `${readiness.totalQuestionsAnswered} answered across ${readiness.totalAttempts} attempt${readiness.totalAttempts === 1 ? "" : "s"}.` : "Complete grounded questions to build readiness."}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><div className="flex items-center justify-between"><span className="text-sm font-semibold">History</span><span className="text-xs text-cyan-300">{attempts.length}</span></div><p className="mt-2 text-xs text-slate-400">{attempts.length ? `Last activity ${new Date(attempts[0].startedAt).toLocaleDateString()}.` : "No attempts yet."}</p></div>
        </section>
      </main>
    </div>
  );
}

export default function TestLabPage() {
  return <ErrorBoundary onError={(error) => console.error("TestLab workspace error:", error.message)}><Suspense fallback={<div className="min-h-dvh bg-slate-950" />}><TestLabWorkspace /></Suspense></ErrorBoundary>;
}
