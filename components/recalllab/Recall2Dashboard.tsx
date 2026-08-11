"use client";
// components/recalllab/Recall2Dashboard.tsx
// Recall 2.0 dashboard — shows Due/Weak/Forgotten/Mastered stats,
// phase cards for targeted sessions, blueprint list grouped by category,
// and import from existing RecallSets.

import React, { useCallback, useMemo, useState } from "react";
import { computeRecall2Stats, buildSessionQueue } from "@/lib/recalllab/recall2Srs";
import { saveBlueprintsDedup } from "@/lib/recalllab/recall2Store";
import { recallSetToBlueprints } from "@/lib/recalllab/recall2Builder";
import type { RecallBlueprint, RecallCategory, SessionPhase, Recall2Stats } from "@/lib/recalllab/recall2Types";
import type { RecallSet } from "@/lib/recalllab/recallStore";

// ── Category display ──────────────────────────────────────────────────────

const CAT_ORDER: RecallCategory[] = [
  "recognition", "understanding", "procedure", "clinical", "mistake", "transfer",
];

const CAT_LABEL: Record<RecallCategory, string> = {
  recognition:   "★ Recognition",
  understanding: "★★ Understanding",
  procedure:     "★★★ Procedure",
  clinical:      "★★★★ Clinical",
  mistake:       "★★★★ Common Mistake",
  transfer:      "★★★★★ Transfer",
};

const CAT_COLOR: Record<RecallCategory, string> = {
  recognition:   "#94a3b8",
  understanding: "#60a5fa",
  procedure:     "#34d399",
  clinical:      "#f59e0b",
  mistake:       "#f87171",
  transfer:      "#c084fc",
};

// ── Phase config ──────────────────────────────────────────────────────────

interface PhaseCard {
  phase:    SessionPhase;
  title:    string;
  icon:     string;
  subtitle: string;
  color:    string;
}

const PHASE_CARDS: PhaseCard[] = [
  { phase: "warmup",   icon: "☀️",  title: "Warm-up",          subtitle: "Recognition + Understanding due",  color: "#fbbf24" },
  { phase: "weak",     icon: "🔁",  title: "Weak Concepts",    subtitle: "Low ease factor or recent misses", color: "#f87171" },
  { phase: "clinical", icon: "🩺",  title: "Clinical Cases",   subtitle: "Application to case scenarios",    color: "#f59e0b" },
  { phase: "mixed",    icon: "🎯",  title: "Mixed Review",     subtitle: "All cards due today",              color: "#60a5fa" },
  { phase: "mastery",  icon: "🏆",  title: "Mastery Challenge",subtitle: "Transfer + long-interval tests",   color: "#c084fc" },
];

// ── Props ─────────────────────────────────────────────────────────────────

interface Recall2DashboardProps {
  blueprints:    RecallBlueprint[];
  legacySets:    RecallSet[];
  bookId?:       string;
  topic?:        string;
  bookTitle?:    string;
  onStartSession: (queue: RecallBlueprint[], phases: SessionPhase[]) => void;
  onRefresh:     () => void;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function Recall2Dashboard({
  blueprints,
  legacySets,
  bookId,
  topic,
  bookTitle,
  onStartSession,
  onRefresh,
}: Recall2DashboardProps) {
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [expandedCat, setExpandedCat] = useState<RecallCategory | null>(null);

  const stats  = useMemo(() => computeRecall2Stats(blueprints), [blueprints]);
  const today  = new Date().toISOString().slice(0, 10);
  const hasDue = blueprints.some(bp => bp.dueDate <= today);

  // Group blueprints by category
  const byCategory = useMemo(() => {
    const map = new Map<RecallCategory, RecallBlueprint[]>();
    for (const cat of CAT_ORDER) map.set(cat, []);
    for (const bp of blueprints) {
      const arr = map.get(bp.category);
      if (arr) arr.push(bp);
    }
    return map;
  }, [blueprints]);

  // ── Import from legacy RecallSets ───────────────────────────────────

  const handleImport = useCallback(async () => {
    const importable = bookId
      ? legacySets.filter(s => s.bookId === bookId)
      : legacySets;
    if (importable.length === 0) { setImportMsg("No existing recall sets to import."); return; }

    setImporting(true);
    try {
      let totalSaved = 0, totalSkipped = 0;
      for (const set of importable) {
        const bps    = recallSetToBlueprints(set);
        const result = await saveBlueprintsDedup(bps, set.bookId);
        totalSaved   += result.saved;
        totalSkipped += result.skipped;
      }
      setImportMsg(`Imported ${totalSaved} card${totalSaved !== 1 ? "s" : ""} (${totalSkipped} duplicates skipped).`);
      onRefresh();
    } catch {
      setImportMsg("Import failed — please try again.");
    } finally {
      setImporting(false);
    }
  }, [legacySets, bookId, onRefresh]);

  // ── Session launchers ────────────────────────────────────────────────

  function startPhase(phase: SessionPhase) {
    const queue = buildSessionQueue(blueprints, [phase]);
    if (queue.length === 0) return;
    onStartSession(queue, [phase]);
  }

  function startFullSession() {
    const queue = buildSessionQueue(blueprints, ["warmup", "weak", "clinical", "mixed", "mastery"]);
    if (queue.length === 0) return;
    onStartSession(queue, ["warmup", "weak", "clinical", "mixed", "mastery"]);
  }

  function startDueOnly() {
    const queue = buildSessionQueue(blueprints, ["mixed"]);
    if (queue.length === 0) return;
    onStartSession(queue, ["mixed"]);
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", gap: 0 }}>

      {/* ── Stats bar ───────────────────────────────────────────────── */}
      <div style={{ padding: "14px 14px 0", flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 10, letterSpacing: "0.06em" }}>
          RECALL OVERVIEW
          {stats.total > 0 && (
            <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 400, color: "rgba(148,163,184,0.5)" }}>
              {stats.total} card{stats.total !== 1 ? "s" : ""}
              {stats.estimatedMinutes > 0 ? ` · ~${stats.estimatedMinutes} min` : ""}
            </span>
          )}
        </div>
        <StatBar stats={stats} />
      </div>

      {/* ── Primary action buttons ───────────────────────────────────── */}
      {blueprints.length > 0 && (
        <div style={{ padding: "10px 14px", display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={startFullSession}
            disabled={!hasDue}
            style={{ flex: 1, padding: "9px 0", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: hasDue ? "pointer" : "not-allowed", background: hasDue ? "#3b82f6" : "rgba(59,130,246,0.2)", border: "none", color: hasDue ? "#fff" : "rgba(148,163,184,0.4)" }}
          >
            ▶ Full Session
          </button>
          <button
            type="button"
            onClick={startDueOnly}
            disabled={!hasDue}
            style={{ padding: "9px 14px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: hasDue ? "pointer" : "not-allowed", background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", color: hasDue ? "#93c5fd" : "rgba(148,163,184,0.35)" }}
          >
            Due only ({stats.due})
          </button>
        </div>
      )}

      {/* ── Phase cards ────────────────────────────────────────────── */}
      {blueprints.length > 0 && (
        <div style={{ padding: "0 14px 10px", flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", color: "rgba(148,163,184,0.5)", marginBottom: 7 }}>
            STUDY PHASES
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {PHASE_CARDS.map(pc => {
              const count = buildSessionQueue(blueprints, [pc.phase]).length;
              const active = count > 0;
              return (
                <button
                  key={pc.phase}
                  type="button"
                  onClick={() => active && startPhase(pc.phase)}
                  disabled={!active}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "9px 10px",
                    borderRadius: 9, textAlign: "left", cursor: active ? "pointer" : "default",
                    background: active ? `${pc.color}0d` : "rgba(255,255,255,0.02)",
                    border: `1px solid ${active ? pc.color + "28" : "rgba(255,255,255,0.05)"}`,
                  }}
                >
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{pc.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: active ? "rgba(255,255,255,0.85)" : "rgba(148,163,184,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {pc.title}
                    </div>
                    <div style={{ fontSize: 8, color: active ? "rgba(148,163,184,0.55)" : "rgba(148,163,184,0.25)", marginTop: 1 }}>
                      {active ? `${count} card${count !== 1 ? "s" : ""}` : "none due"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Blueprint list by category ──────────────────────────────── */}
      {blueprints.length > 0 && (
        <div style={{ padding: "0 14px 10px", flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", color: "rgba(148,163,184,0.5)", marginBottom: 7 }}>
            CARDS BY CATEGORY
          </div>
          {CAT_ORDER.map(cat => {
            const cards = byCategory.get(cat) ?? [];
            if (cards.length === 0) return null;
            const open = expandedCat === cat;
            return (
              <div key={cat} style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  onClick={() => setExpandedCat(open ? null : cat)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 10px", borderRadius: 7, textAlign: "left", cursor: "pointer",
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: CAT_COLOR[cat], flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>
                    {CAT_LABEL[cat]}
                  </span>
                  <span style={{ fontSize: 9, color: "rgba(148,163,184,0.45)", fontVariantNumeric: "tabular-nums" }}>
                    {cards.length}
                  </span>
                  <span style={{ fontSize: 9, color: "rgba(148,163,184,0.35)" }}>{open ? "▲" : "▼"}</span>
                </button>
                {open && (
                  <div style={{ padding: "4px 0 2px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
                    {cards.slice(0, 12).map(bp => (
                      <BlueprintRow key={bp.id} bp={bp} />
                    ))}
                    {cards.length > 12 && (
                      <div style={{ fontSize: 9, color: "rgba(148,163,184,0.35)", paddingLeft: 6 }}>
                        +{cards.length - 12} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Empty state + import ───────────────────────────────────── */}
      <div style={{ padding: "0 14px 16px", flexShrink: 0 }}>
        {blueprints.length === 0 && (
          <div style={{ padding: "20px 0", textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🃏</div>
            <div style={{ fontSize: 12, color: "rgba(148,163,184,0.65)", marginBottom: 14, lineHeight: 1.6 }}>
              No Recall cards yet.{"\n"}
              Import from your existing recall sets to get started.
            </div>
          </div>
        )}

        {legacySets.length > 0 && (
          <>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", color: "rgba(148,163,184,0.4)", marginBottom: 7 }}>
              IMPORT FROM RECALL LAB 1.0
            </div>
            <button
              type="button"
              onClick={handleImport}
              disabled={importing}
              style={{
                width: "100%", padding: "9px 0", borderRadius: 8, fontSize: 11, fontWeight: 600,
                background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)",
                color: importing ? "rgba(148,163,184,0.4)" : "#a5b4fc",
                cursor: importing ? "not-allowed" : "pointer",
              }}
            >
              {importing ? "Importing…" : `↑ Import ${legacySets.length} existing set${legacySets.length !== 1 ? "s" : ""}`}
            </button>
            {importMsg && (
              <div style={{ fontSize: 10, color: "rgba(148,163,184,0.6)", marginTop: 6, textAlign: "center" }}>
                {importMsg}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function StatBar({ stats }: { stats: Recall2Stats }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 6 }}>
      <StatCell label="Due"      value={stats.due}      color="#60a5fa" />
      <StatCell label="Weak"     value={stats.weak}     color="#f87171" />
      <StatCell label="Forgotten" value={stats.forgotten} color="#f97316" />
      <StatCell label="Mastered" value={stats.mastered}  color="#10b981" />
    </div>
  );
}

function StatCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "8px 4px", borderRadius: 8,
      background: value > 0 ? `${color}10` : "rgba(255,255,255,0.02)",
      border: `1px solid ${value > 0 ? color + "25" : "rgba(255,255,255,0.05)"}`,
    }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: value > 0 ? color : "rgba(148,163,184,0.3)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
      <span style={{ fontSize: 8, color: "rgba(148,163,184,0.5)", letterSpacing: "0.04em" }}>{label}</span>
    </div>
  );
}

function BlueprintRow({ bp }: { bp: RecallBlueprint }) {
  const today  = new Date().toISOString().slice(0, 10);
  const isDue  = bp.dueDate <= today;
  const efPct  = Math.round(((bp.easeFactor - 1.3) / (2.5 - 1.3)) * 100);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, padding: "5px 8px",
      borderRadius: 6, background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.04)",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: isDue ? "#60a5fa" : "rgba(148,163,184,0.2)", flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 9, color: "rgba(203,213,225,0.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {bp.front.slice(0, 70)}
      </span>
      <span style={{ fontSize: 8, color: "rgba(148,163,184,0.35)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
        EF {bp.easeFactor.toFixed(1)}
      </span>
    </div>
  );
}
