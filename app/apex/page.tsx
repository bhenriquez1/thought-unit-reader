"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ErrorBoundary from "@/components/ErrorBoundary";
import {
  getUserBookCatalogue,
  getLastSelectedTestLabDocumentId,
  setLastSelectedTestLabDocumentId,
  type CatalogueBook,
} from "@/lib/apex/bookCatalogue";
import { getCurrentApexUserId } from "@/lib/apex/currentApexUserId";
import { listAttempts, loadReadinessState } from "@/lib/datApex/idbStore";
import type { DatAttempt, DatReadinessState } from "@/lib/datApex/types";
import { EXAM_PROFILE_CATALOG, type ExamProfileCatalogEntry } from "@/lib/examEngine/profiles/profileCatalog";
import { CUSTOM_EXAM_PROFILE_ID } from "@/lib/examEngine/profiles/customProfile";

// V2 intentionally does not inherit the old DAT-dashboard preference. The
// canonical TestLab is source-first, so a general uploaded textbook opens as
// Custom Exam unless the learner explicitly chooses DAT again.
const ACTIVE_PROFILE_STORAGE_KEY = "avrrio:testlab:activeProfileId:v2";

function readStoredProfile(): string {
  try {
    const stored = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
    return stored && EXAM_PROFILE_CATALOG.some((profile) => profile.id === stored && profile.available)
      ? stored
      : CUSTOM_EXAM_PROFILE_ID;
  } catch {
    return CUSTOM_EXAM_PROFILE_ID;
  }
}

function buildGeneratorUrl(profileId: string, documentId?: string, mode?: "practice" | "simulation"): string {
  const params = new URLSearchParams({ examType: profileId });
  // TestLab source binding fix — documentId (stable, content-hash identity)
  // is the only identity this deep-link carries now; the generator page
  // never falls back to a title/filename. See
  // lib/library/userLibrary.ts's own header comment.
  if (documentId) params.set("sourceDocumentId", documentId);
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
  const searchParams = useSearchParams();
  const [profileId, setProfileId] = useState(readStoredProfile);
  const [books, setBooks] = useState<CatalogueBook[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [booksError, setBooksError] = useState<string | null>(null);
  // TestLab source binding fix — selection is keyed by documentId (stable
  // content-hash identity), never bookId/title/filename. null means "no
  // valid selection" and must render as empty, never a stale fallback.
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<DatAttempt[]>([]);
  const [readiness, setReadiness] = useState<DatReadinessState | null>(null);
  // P1 remediation L3 — a book was explicitly requested by documentId/
  // bookId but the freshly-loaded catalogue doesn't contain it yet. The
  // two most plausible real causes (a guest upload's localStorage write
  // still finishing when this route did a hard cross-router navigation,
  // or a slow Firebase auth-state resolution on this fresh page load) are
  // both transient — this self-heals with exactly one automatic retry
  // per mount rather than permanently showing "Add a source in Reader
  // first" for a book that really is there. A ref, not state: retrying
  // must not itself trigger a re-render/re-run of the mount effect.
  const retriedForMissingSourceRef = useRef(false);

  const loadWorkspace = useCallback(async () => {
    setBooksLoading(true);
    setBooksError(null);
    try {
      const [catalogue, savedAttempts, savedReadiness] = await Promise.all([
        getUserBookCatalogue(),
        listAttempts(),
        loadReadinessState(getCurrentApexUserId()),
      ]);

      const requestedDocId = searchParams?.get("sourceDocumentId") ?? "";
      const requestedBookId = searchParams?.get("sourceBookId") ?? "";
      const requestedSpecificBook = !!(requestedDocId || requestedBookId);
      const requestedBookMissing =
        requestedSpecificBook &&
        !catalogue.some((b) => b.documentId === requestedDocId || b.bookId === requestedBookId);

      if (requestedBookMissing && !retriedForMissingSourceRef.current) {
        retriedForMissingSourceRef.current = true;
        setTimeout(() => { void loadWorkspace(); }, 1200);
        return; // keep the "Loading…" state through the retry — never flash the empty state for a book that really exists
      }

      setBooks(catalogue);
      setAttempts(savedAttempts);
      setReadiness(savedReadiness);
      // Resolution priority, never a hardcoded/cached title fallback:
      //   1. an incoming deep-link (?sourceDocumentId=..., or the legacy
      //      ?sourceBookId=... a bookmarked link might still carry)
      //   2. this device's own last-picked TestLab source, IF it still
      //      resolves to a real catalogue entry (a deleted/renamed book
      //      is never shown)
      //   3. the most recently uploaded book in the Library
      //   4. nothing — an empty catalogue means no selection, not a guess
      setSelectedDocumentId((current) => {
        if (current) return current;
        const fromParam =
          catalogue.find((b) => b.documentId === requestedDocId) ??
          (requestedBookId ? catalogue.find((b) => b.bookId === requestedBookId) : undefined);
        if (fromParam) return fromParam.documentId;
        const lastSelected = getLastSelectedTestLabDocumentId();
        const fromLastSelected = lastSelected ? catalogue.find((b) => b.documentId === lastSelected) : undefined;
        if (fromLastSelected) return fromLastSelected.documentId;
        return catalogue[0]?.documentId ?? null;
      });
      setBooksLoading(false);
    } catch {
      setBooksError("TestLab could not load your saved sources. Your Reader data was not changed.");
      setBooksLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  const selectedBook = useMemo(
    () => books.find((book) => book.documentId === selectedDocumentId) ?? null,
    [books, selectedDocumentId],
  );

  // Persist every real selection (deep-linked, restored, or manually
  // picked) as this device's own "last selected" — but only once it's a
  // validated catalogue entry, never a raw id.
  useEffect(() => {
    if (selectedBook) setLastSelectedTestLabDocumentId(selectedBook.documentId);
  }, [selectedBook]);

  // Diagnostics — dev-only. selectedTestLabDocumentId and
  // displayedDocument's own documentId MUST always agree, because
  // selectedBook is derived by looking selectedDocumentId up in the same
  // books array that renders it; if they ever disagree, something is
  // tracking a title/id independently of this lookup.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const diagnostics = {
      selectedTestLabDocumentId: selectedDocumentId,
      selectedLibraryRecordFound: !!selectedBook,
      selectedDocumentTitle: selectedBook?.bookTitle ?? null,
      sourceThoughtUnitCount: selectedBook?.noteCount ?? 0,
    };
    if (selectedBook && selectedDocumentId !== selectedBook.documentId) {
      console.error("[TESTLAB_SOURCE_STATE_MISMATCH]", diagnostics);
    } else {
      console.log("[TESTLAB_SOURCE_DIAGNOSTICS]", diagnostics);
    }
  }, [selectedDocumentId, selectedBook]);

  const chooseProfile = useCallback((id: string) => {
    setProfileId(id);
    try { localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, id); } catch { /* preference write is non-fatal */ }
  }, []);

  const openBuilder = useCallback((mode?: "practice" | "simulation") => {
    router.push(buildGeneratorUrl(profileId, selectedDocumentId ?? undefined, mode));
  }, [profileId, selectedDocumentId, router]);

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
            {!booksLoading && books.length > 0 && <div className="max-h-80 space-y-3 overflow-y-auto pr-1">{books.map((book) => <SourceCard key={book.documentId} book={book} selected={book.documentId === selectedDocumentId} onSelect={() => setSelectedDocumentId(book.documentId)} />)}</div>}
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
