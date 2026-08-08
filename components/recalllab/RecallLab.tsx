"use client";
// components/recalllab/RecallLab.tsx
// Recall Lab — active recall engine. Subject → Book → Topic → flip cards.

import React, { useEffect, useState } from "react";
import {
  getAllRecallSets,
  getAllRecallSetsAsync,
  deleteRecallSet,
  saveRecallSet,
  updateCardDifficulty,
  buildRecallSetFromThoughtUnit,
  buildRecallSetFromTeachingSequence,
  buildWeakTopicReviewSet,
  deriveSrsState,
  computeDeckStats,
  type RecallSet,
  type RecallCard,
  type CardDifficulty,
  type CardType,
  type SrsState,
} from "@/lib/recalllab/recallStore";
import { type NoteSubject } from "@/lib/notelab/ultraNoteStore";
import type { ThoughtUnitDetail } from "@/lib/insights/buildThoughtUnitDetail";
import type { NoteCard } from "@/lib/insights/synthesizeTeachingOutput";
import Recall2Lab from "./Recall2Lab";

const DEV = process.env.NODE_ENV === "development";

interface RecallLabProps {
  onNavigateToPage?: (pageNumber: number) => void;
  /** When provided, only sets for this book are shown */
  bookId?: string;
  /** Increment to trigger a data reload from localStorage */
  refreshKey?: number;
  /** If set, auto-open this set in a recall session immediately */
  lastSetId?: string;
  /** When set, immediately opens the Recall Lab v2 thought-unit box layout for this unit */
  openUnit?: ThoughtUnitDetail | null;
  /** Called once openUnit has been consumed (opened) — parent should clear it */
  onOpenUnitConsumed?: () => void;
  /** "Visualize" — on-demand diagram for just this thought unit */
  onVisualize?: (detail: ThoughtUnitDetail) => void;
  /** "Open in Whiteboard" — full-page prebuilt diagram, pre-focused on this unit */
  onOpenInWhiteboard?: (detail: ThoughtUnitDetail) => void;
  /** "Open in Explain This Step" — seeds the tutor chat with this unit's source text */
  onOpenExplainStep?: (detail: ThoughtUnitDetail) => void;
  /** When set, highlights the recall set whose knowledgeNodeId matches */
  focusedKnowledgeNodeId?: string | null;
  /** Teaching sequence from the current page — enables "Quick Recall" at the top of dashboard */
  currentPageNoteCards?: NoteCard[] | null;
  /** Current page number (used when building the quick-recall set) */
  currentPage?: number;
  /** Short title for the current page (e.g. pageThesis) */
  currentPageTitle?: string | null;
}

const SUBJECT_ORDER: NoteSubject[] = [
  "Biology",
  "Calculus",
  "Chemistry",
  "Physics",
  "Computer Science",
  "Law",
  "Nursing / Pharmacology",
  "Dental / Clinical",
  "General Notes",
];

const SUBJECT_ICON: Record<NoteSubject, string> = {
  Biology: "🧬",
  Calculus: "📐",
  Chemistry: "🧪",
  Physics: "⚛️",
  "Computer Science": "💻",
  Law: "⚖️",
  "Nursing / Pharmacology": "💊",
  "Dental / Clinical": "🦷",
  "General Notes": "📝",
};

const CARD_TYPE_ICON: Record<string, string> = {
  fact: "📌",
  concept: "🧠",
  mechanism: "⚙️",
  application: "🎯",
  "dat-question": "📝",
  "weak-review": "🔁",
};

const SOURCE_LABEL: Record<string, { label: string; color: string }> = {
  "right-panel":  { label: "Right Panel",      color: "#fbbf24" },
  notelab:        { label: "NoteLab",           color: "#93c5fd" },
  "explain-step": { label: "Explain This Step", color: "#34d399" },
  "study-guide":  { label: "Study Guide",       color: "#c4b5fd" },
  "weak-review":  { label: "Weak Topics",       color: "#f87171" },
  "teach-canvas": { label: "Teaching Canvas",   color: "#a78bfa" },
};

type View =
  | { kind: "dashboard" }
  | { kind: "deck"; set: RecallSet }
  | { kind: "session"; set: RecallSet }
  | { kind: "detail"; detail: ThoughtUnitDetail };

const SRS_LABEL: Record<SrsState, string> = {
  new: "New",
  learning: "Learning",
  review: "Review",
  mastered: "Mastered",
};

const SRS_COLOR: Record<SrsState, string> = {
  new: "#94a3b8",
  learning: "#f59e0b",
  review: "#60a5fa",
  mastered: "#10b981",
};

async function loadSetsAsync(bookId?: string): Promise<RecallSet[]> {
  const all = await getAllRecallSetsAsync();
  const filtered = bookId ? all.filter((s) => s.bookId === bookId) : all;
  DEV && console.log("[RECALL_RENDER_COUNT]", { total: all.length, filtered: filtered.length, bookId: bookId ?? "all" });
  return filtered;
}

function loadSetsSync(bookId?: string): RecallSet[] {
  const all = getAllRecallSets();
  return bookId ? all.filter((s) => s.bookId === bookId) : all;
}

export default function RecallLab({
  onNavigateToPage,
  bookId,
  refreshKey,
  lastSetId,
  openUnit,
  onOpenUnitConsumed,
  onVisualize,
  onOpenInWhiteboard,
  onOpenExplainStep,
  focusedKnowledgeNodeId,
  currentPageNoteCards,
  currentPage,
  currentPageTitle,
}: RecallLabProps) {
  // Start from LS mirror for instant render; IDB async load fills in on mount
  const [sets, setSets] = useState<RecallSet[]>(() => {
    const sync = loadSetsSync(bookId);
    DEV && console.log("[RECALLLAB_MOUNT]", { setsInStorage: sync.length, lastSetId: lastSetId ?? null });
    return sync;
  });
  const [view, setView] = useState<View>({ kind: "dashboard" });
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<"classic" | "v2">("classic");

  // On mount: load from IDB (authoritative)
  useEffect(() => {
    loadSetsAsync(bookId).then((all) => {
      setSets(all);
      setInitialLoaded(true);
      if (lastSetId) {
        const found = all.find((s) => s.id === lastSetId);
        DEV && console.log("[RECALLLAB_INIT_VIEW]", { lastSetId, found: !!found, totalSets: all.length });
        if (found) setView({ kind: "deck", set: found });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload from IDB when refreshKey changes
  useEffect(() => {
    if (!initialLoaded) return;
    loadSetsAsync(bookId).then((all) => {
      setSets(all);
      DEV && console.log("[RECALLLAB_REFRESHKEY]", { refreshKey, count: all.length });
    });
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload + reset to dashboard when the active document changes — without this,
  // switching PDFs while RecallLab is mounted left `sets` filtered to the
  // previous document's bookId until refreshKey/lastSetId/event happened to fire.
  useEffect(() => {
    if (!initialLoaded) return;
    setView({ kind: "dashboard" });
    loadSetsAsync(bookId).then((all) => {
      setSets(all);
      DEV && console.log("[RECALLLAB_BOOKID_CHANGED]", { bookId, count: all.length });
    });
  }, [bookId]); // eslint-disable-line react-hooks/exhaustive-deps

  // IDB-aware recall-lab-updated event
  useEffect(() => {
    const handler = () => {
      loadSetsAsync(bookId).then((all) => {
        setSets(all);
        DEV && console.log("[RECALLLAB_STATE_COUNT]", { count: all.length });
      });
    };
    window.addEventListener("recall-lab-updated", handler);
    return () => window.removeEventListener("recall-lab-updated", handler);
  }, [bookId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When lastSetId changes, auto-open after IDB read
  useEffect(() => {
    if (!lastSetId || !initialLoaded) return;
    loadSetsAsync(bookId).then((all) => {
      setSets(all);
      const found = all.find((s) => s.id === lastSetId);
      DEV && console.log("[RECALLLAB_SELECTED_SET]", { lastSetId, found: !!found, totalSets: all.length });
      if (found) setView({ kind: "deck", set: found });
    });
  }, [lastSetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open the Recall Lab v2 box layout for a thought unit pushed in from RightPanel/LeftPanel.
  useEffect(() => {
    if (!openUnit) return;
    setView({ kind: "detail", detail: openUnit });
    onOpenUnitConsumed?.();
  }, [openUnit]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(id: string) {
    await deleteRecallSet(id);
    const updated = await loadSetsAsync(bookId);
    setSets(updated);
    if ((view.kind === "session" || view.kind === "deck") && view.set.id === id) {
      setView({ kind: "dashboard" });
    }
  }

  // --- Thought Unit detail mode (Recall Lab v2) ---
  if (view.kind === "detail") {
    return (
      <ThoughtUnitDetailView
        detail={view.detail}
        onBack={() => setView({ kind: "dashboard" })}
        onQuizMe={async (detail) => {
          // Persist before opening the session — updateCardDifficulty() looks
          // the set up by id, and an in-memory-only set silently drops every
          // rating (RC "Quiz Me grading is lost", Learning State Engine
          // Phase A). Awaiting the save closes that race: no rating is
          // possible until the set genuinely exists in storage.
          const set = buildRecallSetFromThoughtUnit(detail);
          try {
            await saveRecallSet(set);
          } catch (err) {
            console.error("[RECALL_QUIZ_ME_SAVE_FAILED]", { setId: set.id, error: String(err) });
          }
          setView({ kind: "session", set });
        }}
        onVisualize={onVisualize}
        onOpenInWhiteboard={onOpenInWhiteboard}
        onOpenExplainStep={onOpenExplainStep}
      />
    );
  }

  // --- Deck overview mode ---
  if (view.kind === "deck") {
    return (
      <DeckView
        set={view.set}
        onBack={() => setView({ kind: "dashboard" })}
        onStartSession={(cards) => setView({ kind: "session", set: { ...view.set, cards } })}
        onNavigate={onNavigateToPage}
      />
    );
  }

  // --- Session mode ---
  if (view.kind === "session") {
    return (
      <RecallSession
        set={view.set}
        onClose={() => {
          setView({ kind: "dashboard" });
          loadSetsAsync(bookId).then(setSets);
        }}
        onNavigateToPage={onNavigateToPage}
      />
    );
  }

  // --- Recall 2.0 tab ---
  if (activeTab === "v2") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <RecallTabBar active={activeTab} onChange={setActiveTab} />
        <div style={{ flex: 1, overflow: "hidden" }}>
          <Recall2Lab
            bookId={bookId}
            bookTitle={sets[0]?.bookTitle}
            topic={currentPageTitle ?? undefined}
            legacySets={sets}
            onNavigateToPage={onNavigateToPage}
          />
        </div>
      </div>
    );
  }

  // --- Empty state ---
  if (sets.length === 0) {
    return (
      <div style={{ padding: "40px 24px", textAlign: "center", color: "rgba(148,163,184,0.7)" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 8 }}>
          Recall Lab
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 16 }}>
          Memory-engineering layer
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.8, maxWidth: 320, margin: "0 auto" }}>
          <div style={{ marginBottom: 8, color: "rgba(148,163,184,0.7)" }}>Generate your first recall set:</div>
          <div style={{ background: "rgba(245,200,66,0.08)", border: "1px solid rgba(245,200,66,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 11 }}>
            <span style={{ color: "#fcd34d", fontWeight: 700 }}>⚡ Right Panel</span>
            <span style={{ color: "rgba(255,255,255,0.5)" }}> → </span>
            <span style={{ color: "#fcd34d", fontWeight: 700 }}>Generate Study Set</span>
          </div>
          <div style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
            <span style={{ color: "#93c5fd", fontWeight: 700 }}>📝 NoteLab</span>
            <span style={{ color: "rgba(255,255,255,0.5)" }}> → </span>
            <span style={{ color: "#93c5fd", fontWeight: 700 }}>Generate Cards from Note</span>
          </div>
        </div>
      </div>
    );
  }

  // --- Dashboard ---
  // Group: subject → bookId → sets
  const bySubject = new Map<NoteSubject, Map<string, RecallSet[]>>();
  for (const s of sets) {
    const subj: NoteSubject = s.subject ?? "General Notes";
    if (!bySubject.has(subj)) bySubject.set(subj, new Map());
    const byBook = bySubject.get(subj)!;
    const bookKey = s.bookId;
    if (!byBook.has(bookKey)) byBook.set(bookKey, []);
    byBook.get(bookKey)!.push(s);
  }
  const usedSubjects = SUBJECT_ORDER.filter((s) => bySubject.has(s));

  const totalCards = sets.reduce((n, s) => n + s.cards.length, 0);
  const missedTotal = sets.reduce((n, s) => n + s.cards.filter((c) => c.isMissed).length, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Version tab bar */}
      <RecallTabBar active={activeTab} onChange={setActiveTab} />
      {/* Header */}
      <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.95)" }}>🎯 Recall Lab</div>
            <div style={{ fontSize: 10, color: "rgba(148,163,184,0.55)", marginTop: 2 }}>
              {sets.length} set{sets.length !== 1 ? "s" : ""} · {totalCards} cards
              {missedTotal > 0 && <span style={{ color: "#f87171", marginLeft: 6 }}>· {missedTotal} to review</span>}
            </div>
          </div>
          {missedTotal > 0 && (
            <button
              type="button"
              onClick={() => {
                const weakSet = buildWeakTopicReviewSet(sets);
                if (weakSet) setView({ kind: "session", set: weakSet });
              }}
              style={{ fontSize: 10, fontWeight: 700, color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}
            >
              Review Missed
            </button>
          )}
        </div>
      </div>

      {/* Quick Recall from current page */}
      {currentPageNoteCards && currentPageNoteCards.length > 0 && (
        <div style={{ margin: "8px 8px 0", borderRadius: 10, border: "1px solid rgba(167,139,250,0.3)", background: "rgba(139,92,246,0.07)", padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#c4b5fd", marginBottom: 2 }}>
                📖 Current Page Ready
              </div>
              <div style={{ fontSize: 10, color: "rgba(148,163,184,0.6)" }}>
                {currentPageNoteCards.length} concept{currentPageNoteCards.length !== 1 ? "s" : ""}
                {currentPageTitle ? ` · ${currentPageTitle.slice(0, 42)}${currentPageTitle.length > 42 ? "…" : ""}` : currentPage ? ` · p.${currentPage}` : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                // Same fix as "Quiz Me" above — persist before opening the
                // session so grading has a real set to write ratings into.
                const set = buildRecallSetFromTeachingSequence(currentPageNoteCards, {
                  bookId: bookId ?? "default-book",
                  pageNumber: currentPage ?? 0,
                  pageTitle: currentPageTitle ?? undefined,
                });
                try {
                  await saveRecallSet(set);
                } catch (err) {
                  console.error("[RECALL_QUICK_RECALL_SAVE_FAILED]", { setId: set.id, error: String(err) });
                }
                setView({ kind: "session", set });
              }}
              style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: "#c4b5fd", background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.35)", borderRadius: 7, padding: "6px 10px", cursor: "pointer", whiteSpace: "nowrap" }}
            >
              ▶ Quick Recall
            </button>
          </div>
        </div>
      )}

      {/* Subject groups */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
        {usedSubjects.map((subject) => {
          const byBook = bySubject.get(subject)!;
          return (
            <SubjectGroup
              key={subject}
              subject={subject}
              byBook={byBook}
              onStart={(s) => setView({ kind: "session", set: s })}
              onOpenDeck={(s) => setView({ kind: "deck", set: s })}
              onDelete={handleDelete}
              onNavigate={onNavigateToPage}
              focusedKnowledgeNodeId={focusedKnowledgeNodeId}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subject group — collapsible, contains book sub-groups
// ---------------------------------------------------------------------------

function SubjectGroup({
  subject,
  byBook,
  onStart,
  onOpenDeck,
  onDelete,
  onNavigate,
  focusedKnowledgeNodeId,
}: {
  subject: NoteSubject;
  byBook: Map<string, RecallSet[]>;
  onStart: (s: RecallSet) => void;
  onOpenDeck: (s: RecallSet) => void;
  onDelete: (id: string) => void;
  onNavigate?: (page: number) => void;
  focusedKnowledgeNodeId?: string | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const allSets = [...byBook.values()].flat();
  const totalCards = allSets.reduce((n, s) => n + s.cards.length, 0);
  const missedCount = allSets.reduce((n, s) => n + s.cards.filter((c) => c.isMissed).length, 0);

  return (
    <div style={{ marginBottom: 8, borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden", background: "rgba(8,16,32,0.6)" }}>
      {/* Subject header */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", cursor: "pointer", userSelect: "none", background: "rgba(255,255,255,0.03)" }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span style={{ fontSize: 14 }}>{SUBJECT_ICON[subject]}</span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{subject}</span>
        <span style={{ fontSize: 10, color: "rgba(148,163,184,0.5)" }}>{allSets.length} set{allSets.length !== 1 ? "s" : ""} · {totalCards} cards</span>
        {missedCount > 0 && <span style={{ fontSize: 10, color: "#f87171", marginLeft: 4 }}>· {missedCount} missed</span>}
        <span style={{ fontSize: 10, color: "rgba(148,163,184,0.35)", marginLeft: 4 }}>{collapsed ? "▶" : "▼"}</span>
      </div>

      {!collapsed && (
        <div>
          {[...byBook.entries()].map(([bookId, bookSets]) => (
            <BookGroup
              key={bookId}
              bookId={bookId}
              bookTitle={bookSets[0]?.bookTitle}
              sets={bookSets}
              onStart={onStart}
              onOpenDeck={onOpenDeck}
              onDelete={onDelete}
              onNavigate={onNavigate}
              focusedKnowledgeNodeId={focusedKnowledgeNodeId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Book group — collapsible within subject
// ---------------------------------------------------------------------------

function BookGroup({
  bookId,
  bookTitle,
  sets,
  onStart,
  onOpenDeck,
  onDelete,
  onNavigate,
  focusedKnowledgeNodeId,
}: {
  bookId: string;
  bookTitle?: string;
  sets: RecallSet[];
  onStart: (s: RecallSet) => void;
  onOpenDeck: (s: RecallSet) => void;
  onDelete: (id: string) => void;
  onNavigate?: (page: number) => void;
  focusedKnowledgeNodeId?: string | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const label = bookTitle || (bookId.length > 30 ? bookId.slice(0, 30) + "…" : bookId);

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", cursor: "pointer", userSelect: "none" }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span style={{ fontSize: 11 }}>📖</span>
        <span style={{ flex: 1, fontSize: 11, color: "rgba(148,163,184,0.75)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        <span style={{ fontSize: 10, color: "rgba(148,163,184,0.35)" }}>{collapsed ? "▶" : "▼"}</span>
      </div>

      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "0 8px 8px" }}>
          {sets.map((s) => (
            <RecallSetRow
              key={s.id}
              set={s}
              onStart={() => onStart(s)}
              onOpenDeck={() => onOpenDeck(s)}
              onDelete={() => onDelete(s.id)}
              onNavigate={onNavigate}
              focusedKnowledgeNodeId={focusedKnowledgeNodeId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recall Set row
// ---------------------------------------------------------------------------

function RecallSetRow({
  set,
  onStart,
  onOpenDeck,
  onDelete,
  onNavigate,
  focusedKnowledgeNodeId,
}: {
  set: RecallSet;
  onStart: () => void;
  onOpenDeck: () => void;
  onDelete: () => void;
  onNavigate?: (page: number) => void;
  focusedKnowledgeNodeId?: string | null;
}) {
  const missedCount = set.cards.filter((c) => c.isMissed).length;
  const reviewedCount = set.cards.filter((c) => c.reviewCount > 0).length;
  const progress = set.cards.length > 0 ? Math.round((reviewedCount / set.cards.length) * 100) : 0;
  const src = set.sourceLabel ? SOURCE_LABEL[set.sourceLabel] : null;
  const isFocused = !!(focusedKnowledgeNodeId && set.knowledgeNodeId === focusedKnowledgeNodeId);

  return (
    <div style={{ borderRadius: 9, border: isFocused ? "1px solid rgba(139,92,246,0.6)" : "1px solid rgba(255,255,255,0.07)", background: "rgba(11,20,40,0.7)", padding: "10px 12px", boxShadow: isFocused ? "0 0 0 3px rgba(139,92,246,0.15)" : "none", transition: "border-color 0.3s, box-shadow 0.3s" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Topic + source badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#fcd34d", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
              🎯 {set.topic}
            </div>
            {src && (
              <span style={{ fontSize: 9, fontWeight: 700, color: src.color, background: `${src.color}18`, border: `1px solid ${src.color}30`, borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap", flexShrink: 0 }}>
                {src.label}
              </span>
            )}
          </div>

          {/* Meta */}
          <div style={{ fontSize: 10, color: "rgba(148,163,184,0.55)", marginBottom: 6 }}>
            Page {set.pageNumber} · {set.cards.length} cards · {new Date(set.createdAt).toLocaleDateString()}
            {missedCount > 0 && <span style={{ color: "#f87171", marginLeft: 6 }}>{missedCount} missed</span>}
          </div>

          {/* Progress bar */}
          {reviewedCount > 0 && (
            <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, marginBottom: 7, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: progress === 100 ? "#10b981" : "#3b82f6", borderRadius: 2 }} />
            </div>
          )}

          {/* Card type breakdown */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {Object.entries(
              set.cards.reduce((acc, c) => { acc[c.type] = (acc[c.type] ?? 0) + 1; return acc; }, {} as Record<string, number>)
            ).map(([type, count]) => (
              <span key={type} style={{ fontSize: 9, color: "rgba(148,163,184,0.55)", background: "rgba(255,255,255,0.05)", borderRadius: 4, padding: "2px 5px" }}>
                {CARD_TYPE_ICON[type] ?? "•"} {count}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
        <button
          type="button"
          onClick={onOpenDeck}
          style={{ flex: 2, padding: "7px 0", borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
        >
          📊 Open Deck
        </button>
        <button
          type="button"
          onClick={onStart}
          style={{ flex: 2, padding: "7px 0", borderRadius: 7, border: "1px solid rgba(96,165,250,0.3)", background: "rgba(59,130,246,0.1)", color: "#93c5fd", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
        >
          ▶ Start Recall
        </button>
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate(set.pageNumber)}
            style={{ flex: 1, padding: "7px 0", borderRadius: 7, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "rgba(148,163,184,0.7)", fontSize: 11, cursor: "pointer" }}
          >
            p.{set.pageNumber}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.07)", color: "#f87171", fontSize: 11, cursor: "pointer" }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thought Unit detail — Recall Lab v2 "learning workspace" box layout
// ---------------------------------------------------------------------------

function ThoughtUnitBox({
  label,
  color,
  children,
}: {
  label: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${color}30`, background: `${color}0d`, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color, textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,0.88)" }}>{children}</div>
    </div>
  );
}

function ThoughtUnitDetailView({
  detail,
  onBack,
  onQuizMe,
  onVisualize,
  onOpenInWhiteboard,
  onOpenExplainStep,
}: {
  detail: ThoughtUnitDetail;
  onBack: () => void;
  onQuizMe: (detail: ThoughtUnitDetail) => void;
  onVisualize?: (detail: ThoughtUnitDetail) => void;
  onOpenInWhiteboard?: (detail: ThoughtUnitDetail) => void;
  onOpenExplainStep?: (detail: ThoughtUnitDetail) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <button type="button" onClick={onBack} style={{ background: "none", border: "none", color: "rgba(148,163,184,0.7)", fontSize: 12, cursor: "pointer", padding: 0 }}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.95)" }}>🧠 {detail.title}</div>
          <div style={{ fontSize: 10, color: "rgba(148,163,184,0.55)", marginTop: 1 }}>Thought Unit · Page {detail.pageNumber}</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        <ThoughtUnitBox label="Core Idea" color="#fbbf24">{detail.coreIdea}</ThoughtUnitBox>
        {detail.mechanism && <ThoughtUnitBox label="Mechanism" color="#34d399">{detail.mechanism}</ThoughtUnitBox>}
        {detail.whyItMatters && <ThoughtUnitBox label="Why It Matters" color="#60a5fa">{detail.whyItMatters}</ThoughtUnitBox>}
        {detail.commonConfusion && <ThoughtUnitBox label="Common Confusion" color="#f87171">{detail.commonConfusion}</ThoughtUnitBox>}
        {detail.datFact && <ThoughtUnitBox label="DAT High Yield Fact" color="#c4b5fd">{detail.datFact}</ThoughtUnitBox>}
        {detail.examTrap && <ThoughtUnitBox label="Exam Trap" color="#fb923c">⚠️ {detail.examTrap}</ThoughtUnitBox>}

        {/* Recall Card */}
        <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(11,20,40,0.7)", padding: "10px 12px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(148,163,184,0.7)", textTransform: "uppercase", marginBottom: 6 }}>
            🎯 Recall Card
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", marginBottom: 6 }}>{detail.recallCard.front}</div>
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", marginBottom: 6 }} />
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{detail.recallCard.back}</div>
        </div>

        {/* Source text */}
        <div style={{ fontSize: 11, color: "rgba(148,163,184,0.5)", fontStyle: "italic", padding: "0 2px" }}>
          “{detail.sourceText.length > 220 ? detail.sourceText.slice(0, 220) + "…" : detail.sourceText}”
        </div>
      </div>

      {/* Action row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, padding: "10px 14px 14px", flexShrink: 0 }}>
        <button type="button" onClick={() => onQuizMe(detail)} style={rateBtn("#93c5fd", "rgba(59,130,246,0.1)")}>🎯 Quiz Me</button>
        {onVisualize && (
          <button type="button" onClick={() => onVisualize(detail)} style={rateBtn("#c4b5fd", "rgba(167,139,250,0.1)")}>🎨 Visualize</button>
        )}
        {onOpenInWhiteboard && (
          <button type="button" onClick={() => onOpenInWhiteboard(detail)} style={rateBtn("#6ee7b7", "rgba(16,185,129,0.1)")}>🖼️ Open in Whiteboard</button>
        )}
        {onOpenExplainStep && (
          <button type="button" onClick={() => onOpenExplainStep(detail)} style={rateBtn("#fcd34d", "rgba(245,158,11,0.1)")}>💬 Explain This Step</button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deck overview — Memo.cards-style: status tabs, preview, table, study stats
// ---------------------------------------------------------------------------

function MasteryRing({ pct }: { pct: number }) {
  const color = pct >= 80 ? "#10b981" : pct >= 40 ? "#f59e0b" : "#60a5fa";
  return (
    <div
      style={{
        width: 56,
        height: 56,
        borderRadius: "50%",
        background: `conic-gradient(${color} ${pct * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "#0b1428",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 700,
          color: "rgba(255,255,255,0.9)",
        }}
      >
        {pct}%
      </div>
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 9, color: "rgba(148,163,184,0.5)" }}>{label}</div>
    </div>
  );
}

function DeckView({
  set,
  onBack,
  onStartSession,
  onNavigate,
}: {
  set: RecallSet;
  onBack: () => void;
  onStartSession: (cards: RecallCard[]) => void;
  onNavigate?: (page: number) => void;
}) {
  const [filter, setFilter] = useState<SrsState | "all">("all");
  const stats = computeDeckStats(set.cards);
  const filtered = filter === "all" ? set.cards : set.cards.filter((c) => deriveSrsState(c) === filter);
  const preview = filtered[0];

  const tabs: { key: SrsState | "all"; label: string; count: number }[] = [
    { key: "all", label: "All", count: stats.total },
    { key: "new", label: "New", count: stats.new },
    { key: "learning", label: "Learning", count: stats.learning },
    { key: "review", label: "Review", count: stats.review },
    { key: "mastered", label: "Mastered", count: stats.mastered },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <button type="button" onClick={onBack} style={{ background: "none", border: "none", color: "rgba(148,163,184,0.7)", fontSize: 12, cursor: "pointer", padding: 0 }}>← Back</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.95)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            🎯 {set.topic}
          </div>
          <div style={{ fontSize: 10, color: "rgba(148,163,184,0.55)", marginTop: 1 }}>
            {set.bookTitle || set.bookId} · Page {set.pageNumber}
          </div>
        </div>
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate(set.pageNumber)}
            style={{ fontSize: 10, color: "rgba(148,163,184,0.6)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}
          >
            p.{set.pageNumber}
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Status tabs */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tabs.map((t) => {
            const active = filter === t.key;
            const color = t.key === "all" ? "rgba(255,255,255,0.85)" : SRS_COLOR[t.key];
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: active ? "#0b1428" : color,
                  background: active ? color : "rgba(255,255,255,0.05)",
                  border: `1px solid ${color}40`,
                  borderRadius: 7,
                  padding: "5px 10px",
                  cursor: "pointer",
                }}
              >
                {t.label} <span style={{ opacity: 0.75 }}>{t.count}</span>
              </button>
            );
          })}
        </div>

        {/* Card preview */}
        {preview ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(11,20,40,0.7)", padding: "10px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.6)", textTransform: "uppercase", marginBottom: 6 }}>Question</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.88)", lineHeight: 1.5 }}>{preview.front}</div>
            </div>
            <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(11,20,40,0.7)", padding: "10px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.6)", textTransform: "uppercase", marginBottom: 6 }}>Answer</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>{preview.back}</div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "rgba(148,163,184,0.5)", textAlign: "center", padding: "12px 0" }}>
            No cards in this status.
          </div>
        )}

        {/* Start session CTA */}
        <button
          type="button"
          disabled={filtered.length === 0}
          onClick={() => onStartSession(filtered)}
          style={{
            padding: "10px 0",
            borderRadius: 9,
            border: "1px solid rgba(96,165,250,0.35)",
            background: "rgba(59,130,246,0.12)",
            color: "#93c5fd",
            fontSize: 12,
            fontWeight: 700,
            cursor: filtered.length === 0 ? "default" : "pointer",
            opacity: filtered.length === 0 ? 0.4 : 1,
          }}
        >
          ▶ Start Recall Session{filter !== "all" ? ` · ${SRS_LABEL[filter]}` : ""}
        </button>

        {/* Card table */}
        <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 76px 88px", padding: "6px 10px", background: "rgba(255,255,255,0.04)", fontSize: 9, fontWeight: 700, color: "rgba(148,163,184,0.6)", textTransform: "uppercase" }}>
            <div>Card</div><div>Type</div><div>Status</div><div>Last Reviewed</div>
          </div>
          {filtered.map((c) => {
            const state = deriveSrsState(c);
            return (
              <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1fr 70px 76px 88px", padding: "7px 10px", borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 11 }}>
                <div style={{ color: "rgba(255,255,255,0.82)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 6 }}>{c.front}</div>
                <div style={{ color: "rgba(148,163,184,0.6)" }}>{CARD_TYPE_ICON[c.type] ?? "•"}</div>
                <div style={{ color: SRS_COLOR[state], fontWeight: 600 }}>{SRS_LABEL[state]}</div>
                <div style={{ color: "rgba(148,163,184,0.45)" }}>{c.lastReviewedAt ? new Date(c.lastReviewedAt).toLocaleDateString() : "—"}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Study stats footer */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <MasteryRing pct={stats.masteryPct} />
        <div style={{ display: "flex", flex: 1, justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
          <StatChip label="Total" value={stats.total} color="rgba(255,255,255,0.75)" />
          <StatChip label="New" value={stats.new} color={SRS_COLOR.new} />
          <StatChip label="Learning" value={stats.learning} color={SRS_COLOR.learning} />
          <StatChip label="Review" value={stats.review} color={SRS_COLOR.review} />
          <StatChip label="Mastered" value={stats.mastered} color={SRS_COLOR.mastered} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flip card session
// ---------------------------------------------------------------------------

function RecallSession({
  set,
  onClose,
  onNavigateToPage,
}: {
  set: RecallSet;
  onClose: () => void;
  onNavigateToPage?: (page: number) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [localSet, setLocalSet] = useState<RecallSet>(() => ({ ...set, cards: [...set.cards] }));

  const card = localSet.cards[idx];
  const total = localSet.cards.length;
  const reviewedCount = localSet.cards.filter((c) => c.difficulty !== undefined).length;
  const missedInSession = localSet.cards.filter((c) => c.isMissed).length;

  function rate(difficulty: CardDifficulty) {
    // Weak Topics Review cards are copies — write the rating back to the
    // real set/card they came from, so future "missed" status stays accurate.
    void updateCardDifficulty(card.originSetId ?? localSet.id, card.originCardId ?? card.id, difficulty);
    setLocalSet((prev) => ({
      ...prev,
      cards: prev.cards.map((c) =>
        c.id === card.id ? { ...c, difficulty, reviewCount: c.reviewCount + 1, isMissed: difficulty === "hard" } : c
      ),
    }));
    setFlipped(false);
    setTimeout(() => setIdx((i) => Math.min(i + 1, total)), 120);
  }

  if (!card || idx >= total) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{missedInSession === 0 ? "✅" : "📋"}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 6 }}>Session complete</div>
        <div style={{ fontSize: 12, color: "rgba(148,163,184,0.7)", marginBottom: 20 }}>
          {missedInSession === 0 ? "Perfect recall!" : `${missedInSession} card${missedInSession !== 1 ? "s" : ""} to review again`}
        </div>
        <button type="button" onClick={onClose} style={sessionBtn("#3b82f6")}>← Back to Recall Lab</button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "12px 14px", gap: 10 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "rgba(148,163,184,0.7)", fontSize: 12, cursor: "pointer", padding: 0 }}>← Back</button>
        <div style={{ flex: 1, fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.65)", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {set.topic}
        </div>
        <div style={{ fontSize: 10, color: "rgba(148,163,184,0.45)", flexShrink: 0 }}>{idx + 1}/{total}</div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, flexShrink: 0, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${(idx / total) * 100}%`, background: "#3b82f6", borderRadius: 2, transition: "width 0.25s" }} />
      </div>

      {/* Flip card */}
      <div
        style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", cursor: "pointer" }}
        onClick={() => !flipped && setFlipped(true)}
      >
        <div style={{
          borderRadius: 14,
          border: `1px solid ${flipped ? "rgba(96,165,250,0.3)" : "rgba(255,255,255,0.08)"}`,
          background: flipped ? "rgba(15,25,50,0.9)" : "rgba(11,20,40,0.8)",
          padding: "22px 18px",
          minHeight: 160,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          transition: "background 0.2s, border-color 0.2s",
        }}>
          {/* Type badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13 }}>{CARD_TYPE_ICON[card.type] ?? "•"}</span>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: cardTypeColor(card.type), textTransform: "uppercase" }}>{card.type}</span>
            {card.tag && (
              <span style={{ fontSize: 9, fontWeight: 600, color: "#c4b5fd", background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 4, padding: "1px 6px" }}>
                {card.tag}
              </span>
            )}
            {card.isMissed && <span style={{ fontSize: 9, color: "#f87171", marginLeft: "auto" }}>MISSED</span>}
          </div>

          {/* Question */}
          <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", lineHeight: 1.6 }}>
            {card.front}
          </div>

          {/* Answer (after flip) */}
          {flipped && (
            <>
              <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.7 }}>
                {card.back}
              </div>
              {card.hint && (
                <div style={{ fontSize: 11, color: "rgba(148,163,184,0.55)", fontStyle: "italic" }}>
                  💡 {card.hint}
                </div>
              )}
            </>
          )}

          {!flipped && (
            <div style={{ fontSize: 11, color: "rgba(148,163,184,0.35)", marginTop: "auto", textAlign: "center" }}>
              tap to reveal answer
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {flipped ? (
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button type="button" onClick={() => rate("easy")} style={rateBtn("#10b981", "rgba(16,185,129,0.1)")}>✓ Easy</button>
          <button type="button" onClick={() => rate("medium")} style={rateBtn("#f59e0b", "rgba(245,158,11,0.1)")}>～ Medium</button>
          <button type="button" onClick={() => rate("hard")} style={rateBtn("#ef4444", "rgba(239,68,68,0.1)")}>✕ Hard</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            style={{ ...rateBtn("rgba(148,163,184,0.4)", "rgba(255,255,255,0.04)"), opacity: idx === 0 ? 0.3 : 1 }}
          >
            ← Prev
          </button>
          <button type="button" onClick={() => setFlipped(true)} style={rateBtn("#93c5fd", "rgba(59,130,246,0.1)")}>
            Show Answer
          </button>
          <button
            type="button"
            onClick={() => setIdx((i) => Math.min(total, i + 1))}
            disabled={idx >= total - 1}
            style={{ ...rateBtn("rgba(148,163,184,0.4)", "rgba(255,255,255,0.04)"), opacity: idx >= total - 1 ? 0.3 : 1 }}
          >
            Skip →
          </button>
        </div>
      )}

      {onNavigateToPage && (
        <button
          type="button"
          onClick={() => onNavigateToPage(set.pageNumber)}
          style={{ fontSize: 10, color: "rgba(148,163,184,0.4)", background: "none", border: "none", cursor: "pointer", textAlign: "center", flexShrink: 0 }}
        >
          View source · Page {set.pageNumber}
        </button>
      )}
    </div>
  );
}

function cardTypeColor(type: CardType | string): string {
  const colors: Record<string, string> = {
    fact: "#fbbf24",
    concept: "#8fd3ff",
    mechanism: "#6ee7b7",
    application: "#c4b5fd",
    "dat-question": "#fca5a5",
    "weak-review": "#f87171",
  };
  return colors[type] ?? "rgba(148,163,184,0.6)";
}

function rateBtn(color: string, bg: string): React.CSSProperties {
  return {
    flex: 1,
    padding: "9px 0",
    borderRadius: 9,
    border: `1px solid ${color}55`,
    background: bg,
    color,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  };
}

function sessionBtn(color: string): React.CSSProperties {
  return {
    padding: "10px 24px",
    borderRadius: 9,
    border: `1px solid ${color}55`,
    background: `${color}14`,
    color,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  };
}

// ── Version tab bar ───────────────────────────────────────────────────────

function RecallTabBar({
  active,
  onChange,
}: {
  active: "classic" | "v2";
  onChange: (tab: "classic" | "v2") => void;
}) {
  return (
    <div style={{
      display: "flex", gap: 0, flexShrink: 0,
      borderBottom: "1px solid rgba(255,255,255,0.07)",
      background: "rgba(0,0,0,0.2)",
    }}>
      {(["classic", "v2"] as const).map(tab => {
        const isActive = active === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            style={{
              flex: 1, padding: "7px 0",
              fontSize: 10, fontWeight: isActive ? 700 : 500,
              cursor: "pointer", border: "none",
              color: isActive ? "rgba(255,255,255,0.9)" : "rgba(148,163,184,0.45)",
              background: "transparent",
              borderBottom: isActive ? "2px solid #3b82f6" : "2px solid transparent",
              letterSpacing: "0.04em",
            }}
          >
            {tab === "classic" ? "Recall Lab" : "✨ Recall 2.0"}
          </button>
        );
      })}
    </div>
  );
}
