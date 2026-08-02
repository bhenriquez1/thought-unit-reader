"use client";
// components/notelab/EvidenceWorkspace.tsx
// Evidence Workspace — redesigned NoteLab Sources view.
//
// Layout (top to bottom):
//   1. Active Concept header + Concept Health bar
//   2. Learning Timeline (milestone dots)
//   3. Source Evidence list (authority badge, relationship picker, confidence)
//   4. Missing Sources recommendations (rule-based, no API call)
//   5. Source Conflicts (auto-detected contradictions)

import React, { useMemo, useState, useCallback } from "react";
import {
  AUTHORITY_LABELS,
  AUTHORITY_PRIORITY,
  PROVENANCE_COLORS,
  PROVENANCE_LABELS,
  updateSource,
  type LearningSource,
  type EvidenceRelationship,
  type SourceAuthority,
  type LearningSourceType,
} from "@/lib/learningHub/learningSourceStore";
import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";

// ── Relationship config ───────────────────────────────────────────────────

interface RelConfig {
  label: string;
  emoji: string;
  color: string;
}

const REL_CONFIG: Record<EvidenceRelationship, RelConfig> = {
  supports:    { label: "Supports",    emoji: "✅", color: "#10b981" },
  expands:     { label: "Expands",     emoji: "➕", color: "#60a5fa" },
  illustrates: { label: "Illustrates", emoji: "💡", color: "#f59e0b" },
  contradicts: { label: "Contradicts", emoji: "⚡", color: "#f87171" },
  updates:     { label: "Updates",     emoji: "🔄", color: "#a78bfa" },
  questions:   { label: "Questions",   emoji: "❓", color: "#94a3b8" },
};

const ALL_RELATIONSHIPS: EvidenceRelationship[] = [
  "supports", "expands", "illustrates", "contradicts", "updates", "questions",
];

// ── Authority display ─────────────────────────────────────────────────────

const AUTHORITY_WEIGHT: Record<SourceAuthority, number> = {
  "primary-textbook":       20,
  "professional-guideline": 16,
  "professor-material":     13,
  "exam-blueprint":         11,
  "peer-reviewed":           8,
  "educational-video":       5,
  "ai-explanation":          4,
  "personal-note":           2,
};

const AUTHORITY_BADGE_COLOR: Record<SourceAuthority, string> = {
  "primary-textbook":       "#fde047",
  "professional-guideline": "#60a5fa",
  "professor-material":     "#93c5fd",
  "exam-blueprint":         "#fdba74",
  "peer-reviewed":          "#86efac",
  "educational-video":      "#d8b4fe",
  "ai-explanation":         "#67e8f9",
  "personal-note":          "#94a3b8",
};

// ── Concept Health computation ────────────────────────────────────────────

interface ConceptHealth {
  understanding: number;
  evidenceDepth: number;
  application:   number;
  recall:        number;
  overall:       number;
}

function computeConceptHealth(sources: LearningSource[]): ConceptHealth {
  if (sources.length === 0) return { understanding: 0, evidenceDepth: 0, application: 0, recall: 0, overall: 0 };

  // Understanding: high-authority sources (priority 1-3)
  const authSources = sources.filter(s => AUTHORITY_PRIORITY[s.authorityLevel] <= 3);
  const understanding = Math.min(100, authSources.length * 35);

  // Evidence depth: weighted sum of all source authority weights
  const rawWeight = sources.reduce((sum, s) => sum + (AUTHORITY_WEIGHT[s.authorityLevel] ?? 2), 0);
  const evidenceDepth = Math.min(100, Math.round((rawWeight / 60) * 100));

  // Application: exam-blueprint + peer-reviewed + research sources
  const applicationTypes: LearningSourceType[] = ["exam_blueprint", "article", "research", "chief_resident"];
  const appSources = sources.filter(s => applicationTypes.includes(s.type));
  const application = Math.min(100, appSources.length * 40);

  // Recall: look for recall_mistake + personal_note sources (proxy for active recall done)
  const recallTypes: LearningSourceType[] = ["recall_mistake", "personal_note", "whiteboard"];
  const recallSources = sources.filter(s => recallTypes.includes(s.type));
  const recall = Math.min(100, recallSources.length * 50);

  const overall = Math.round((understanding + evidenceDepth + application + recall) / 4);
  return { understanding, evidenceDepth, application, recall, overall };
}

// ── Learning Timeline ─────────────────────────────────────────────────────

interface TimelineMilestone {
  icon:     string;
  label:    string;
  achieved: boolean;
  detail?:  string;
}

function computeTimeline(
  sources: LearningSource[],
  studyModel: CurrentPageStudyModel | null | undefined,
): TimelineMilestone[] {
  const hasSourceType = (types: LearningSourceType[]) =>
    sources.some(s => types.includes(s.type));

  return [
    {
      icon:     "📖",
      label:    "Read",
      achieved: Boolean(studyModel?.pageThesis) || sources.length > 0,
      detail:   "Page studied",
    },
    {
      icon:     "🔆",
      label:    "Highlighted",
      achieved: Boolean(studyModel?.visualAnchors?.length),
      detail:   `${studyModel?.visualAnchors?.length ?? 0} highlights`,
    },
    {
      icon:     "🎨",
      label:    "Whiteboard",
      achieved: hasSourceType(["whiteboard"]),
      detail:   "Visual diagram saved",
    },
    {
      icon:     "🩺",
      label:    "Chief Resident",
      achieved: hasSourceType(["chief_resident"]),
      detail:   "Expert explanation saved",
    },
    {
      icon:     "🃏",
      label:    "Recall",
      achieved: hasSourceType(["recall_mistake"]) || sources.some(s => s.thoughtUnits.length > 0),
      detail:   "Cards reviewed",
    },
    {
      icon:     "✨",
      label:    "Mastered",
      achieved: sources.filter(s => AUTHORITY_PRIORITY[s.authorityLevel] <= 3).length >= 2
             && hasSourceType(["recall_mistake", "personal_note"]),
      detail:   "Multi-source + recall confirmed",
    },
  ];
}

// ── Missing Sources recommendations ──────────────────────────────────────

interface SourceRec {
  icon:     string;
  label:    string;
  type:     LearningSourceType;
  priority: "high" | "medium" | "low";
}

function computeMissingRecs(sources: LearningSource[]): SourceRec[] {
  const has = (types: LearningSourceType[]) => sources.some(s => types.includes(s.type));
  const recs: SourceRec[] = [];

  if (!has(["textbook"]))
    recs.push({ icon: "📖", label: "Link your textbook passage — it grounds all other sources", type: "textbook", priority: "high" });
  if (!has(["professor_notes", "lecture_notes"]))
    recs.push({ icon: "🎓", label: "Add professor or lecture notes for this topic", type: "professor_notes", priority: "high" });
  if (!has(["exam_blueprint"]))
    recs.push({ icon: "📋", label: "Add exam objectives to focus your study scope", type: "exam_blueprint", priority: "medium" });
  if (!has(["video", "audio"]))
    recs.push({ icon: "▶",  label: "A visual or video explanation reinforces memory", type: "video", priority: "medium" });
  if (!has(["article", "research"]))
    recs.push({ icon: "🔗", label: "A peer-reviewed source strengthens your evidence base", type: "article", priority: "low" });

  return recs.slice(0, 4);
}

// ── Conflict detection ────────────────────────────────────────────────────

interface SourceConflict {
  sourceA: LearningSource;
  sourceB: LearningSource;
  reason:  string;
}

const CONFLICT_OPPOSITES: [string, string][] = [
  ["increases", "decreases"],
  ["activates", "inhibits"],
  ["promotes",  "prevents"],
  ["causes",    "prevents"],
  ["required",  "not required"],
  ["always",    "never"],
  ["positive",  "negative"],
  ["higher",    "lower"],
  ["more",      "less"],
  ["does",      "doesn't"],
];

function detectConflicts(sources: LearningSource[]): SourceConflict[] {
  const conflicts: SourceConflict[] = [];

  // User-tagged contradictions (explicit)
  const contradicting = sources.filter(s => s.relationship === "contradicts");
  for (const c of contradicting) {
    const higher = sources.find(
      s => s.id !== c.id && AUTHORITY_PRIORITY[s.authorityLevel] < AUTHORITY_PRIORITY[c.authorityLevel]
    );
    if (higher) {
      conflicts.push({ sourceA: higher, sourceB: c, reason: "User marked as contradiction" });
    }
  }

  // Auto-detected: text-pattern opposites between sources of different authority
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const a = sources[i]; const b = sources[j];
      if (a.authorityLevel === b.authorityLevel) continue;
      const ta = a.text.toLowerCase(); const tb = b.text.toLowerCase();
      for (const [pos, neg] of CONFLICT_OPPOSITES) {
        if (ta.includes(pos) && tb.includes(neg)) {
          conflicts.push({ sourceA: a, sourceB: b, reason: `One says "${pos}", the other says "${neg}"` });
          break;
        }
        if (ta.includes(neg) && tb.includes(pos)) {
          conflicts.push({ sourceA: b, sourceB: a, reason: `One says "${pos}", the other says "${neg}"` });
          break;
        }
      }
      if (conflicts.length >= 3) break;
    }
    if (conflicts.length >= 3) break;
  }

  // Deduplicate by sourceA.id+sourceB.id pair
  const seen = new Set<string>();
  return conflicts.filter(c => {
    const key = [c.sourceA.id, c.sourceB.id].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

// ── Props ─────────────────────────────────────────────────────────────────

interface EvidenceWorkspaceProps {
  sources:           LearningSource[];
  activeUnitId?:     string | null;
  activeUnitLabel?:  string | null;
  studyModel?:       CurrentPageStudyModel | null;
  onUpdateSource:    (source: LearningSource) => void;
  onDeleteSource:    (id: string) => void;
  onRequestAdd:      () => void;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function EvidenceWorkspace({
  sources,
  activeUnitId,
  activeUnitLabel,
  studyModel,
  onUpdateSource,
  onDeleteSource,
  onRequestAdd,
}: EvidenceWorkspaceProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showConflicts, setShowConflicts] = useState(false);

  const health    = useMemo(() => computeConceptHealth(sources), [sources]);
  const timeline  = useMemo(() => computeTimeline(sources, studyModel), [sources, studyModel]);
  const missingRecs = useMemo(() => computeMissingRecs(sources), [sources]);
  const conflicts = useMemo(() => detectConflicts(sources), [sources]);

  // Sort sources: by authority priority, then creation date
  const sortedSources = useMemo(() =>
    [...sources].sort((a, b) =>
      AUTHORITY_PRIORITY[a.authorityLevel] - AUTHORITY_PRIORITY[b.authorityLevel] ||
      b.createdAt - a.createdAt
    ),
    [sources]
  );

  const handleRelationshipChange = useCallback((source: LearningSource, rel: EvidenceRelationship) => {
    const updated = { ...source, relationship: rel, updatedAt: Date.now() };
    updateSource(updated).then(() => onUpdateSource(updated));
  }, [onUpdateSource]);

  const handleConfidenceChange = useCallback((source: LearningSource, val: number) => {
    const updated = { ...source, sourceConfidence: val, updatedAt: Date.now() };
    updateSource(updated).then(() => onUpdateSource(updated));
  }, [onUpdateSource]);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, overflowY: "auto", height: "100%" }}>

      {/* ── 1. Active Concept + Health ────────────────────────────── */}
      <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        {activeUnitId ? (
          <>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(253,224,71,0.6)", marginBottom: 4 }}>
              ACTIVE CONCEPT
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(253,224,71,0.95)", lineHeight: 1.6, marginBottom: 10, padding: "8px 10px", background: "rgba(253,224,71,0.05)", borderRadius: 6, borderLeft: "2px solid rgba(253,224,71,0.3)" }}>
              {activeUnitLabel ?? activeUnitId}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 10, color: "rgba(148,163,184,0.45)", marginBottom: 10, fontStyle: "italic" }}>
            Select a concept to focus the Evidence Workspace
          </div>
        )}

        {/* Concept Health */}
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", color: "rgba(148,163,184,0.5)", marginBottom: 6 }}>
          CONCEPT HEALTH
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <HealthBar label="Understanding"  value={health.understanding} color="#60a5fa" />
          <HealthBar label="Evidence Depth" value={health.evidenceDepth} color="#34d399" />
          <HealthBar label="Application"    value={health.application}   color="#f59e0b" />
          <HealthBar label="Recall"         value={health.recall}        color="#c084fc" />
        </div>
        <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${health.overall}%`, borderRadius: 2, background: health.overall >= 70 ? "#10b981" : health.overall >= 40 ? "#f59e0b" : "#f87171", transition: "width 0.4s" }} />
          </div>
          <span style={{ fontSize: 9, fontWeight: 700, color: health.overall >= 70 ? "#10b981" : health.overall >= 40 ? "#f59e0b" : "#f87171", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
            {health.overall}% overall
          </span>
        </div>
      </div>

      {/* ── 2. Learning Timeline ──────────────────────────────────── */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", color: "rgba(148,163,184,0.5)", marginBottom: 8 }}>
          LEARNING JOURNEY
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 0, position: "relative" }}>
          {/* connector line */}
          <div style={{ position: "absolute", top: 10, left: 10, right: 10, height: 2, background: "rgba(255,255,255,0.06)", zIndex: 0 }} />
          {timeline.map((m, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, position: "relative", zIndex: 1 }}>
              <div style={{
                width: 20, height: 20, borderRadius: "50%",
                background: m.achieved ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.04)",
                border: `2px solid ${m.achieved ? "#3b82f6" : "rgba(255,255,255,0.1)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, transition: "all 0.3s",
                boxShadow: m.achieved ? "0 0 8px rgba(59,130,246,0.3)" : "none",
              }}>
                {m.achieved ? <span>{m.icon}</span> : <span style={{ fontSize: 6, color: "rgba(148,163,184,0.3)" }}>○</span>}
              </div>
              <span style={{ fontSize: 7, fontWeight: m.achieved ? 600 : 400, color: m.achieved ? "rgba(203,213,225,0.8)" : "rgba(148,163,184,0.35)", textAlign: "center", lineHeight: 1.2, maxWidth: 36 }}>
                {m.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 3. Source Evidence List ───────────────────────────────── */}
      <div style={{ padding: "10px 14px 4px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", color: "rgba(148,163,184,0.5)" }}>
            SOURCE EVIDENCE ({sortedSources.length})
          </span>
          <button
            type="button"
            onClick={onRequestAdd}
            style={{ marginLeft: "auto", fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", color: "#34d399", cursor: "pointer" }}
          >
            + Add Source
          </button>
        </div>

        {sortedSources.length === 0 ? (
          <div style={{ padding: "20px 0", textAlign: "center" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>📚</div>
            <div style={{ fontSize: 11, color: "rgba(148,163,184,0.5)", lineHeight: 1.6 }}>
              No sources linked yet.{"\n"}Add a source to begin building your evidence.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 4 }}>
            {sortedSources.map(source => (
              <SourceEvidenceCard
                key={source.id}
                source={source}
                expanded={expandedId === source.id}
                onToggle={() => setExpandedId(expandedId === source.id ? null : source.id)}
                onRelationshipChange={(rel) => handleRelationshipChange(source, rel)}
                onConfidenceChange={(val) => handleConfidenceChange(source, val)}
                onDelete={() => onDeleteSource(source.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── 4. Avrrio Interpretation ─────────────────────────────── */}
      {studyModel && (
        studyModel.studyNotes.whyThisMatters ||
        studyModel.studyNotes.commonConfusion ||
        studyModel.studyNotes.keyMechanism    ||
        studyModel.studyNotes.clinicalPearl   ||
        studyModel.studyNotes.examSignal
      ) && (
        <div style={{ padding: "10px 14px 8px", borderTop: "1px solid rgba(103,232,249,0.12)", flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", color: "rgba(103,232,249,0.55)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <span>🧬</span>
            <span>AVRRIO INTERPRETATION</span>
            <span style={{ fontSize: 8, fontWeight: 400, color: "rgba(103,232,249,0.35)", marginLeft: "auto" }}>AI-inferred · not source text</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {studyModel.studyNotes.whyThisMatters && (
              <InterpretationNote label="Why It Matters" text={studyModel.studyNotes.whyThisMatters} color="#67e8f9" />
            )}
            {studyModel.studyNotes.keyMechanism && (
              <InterpretationNote label="Mechanism" text={studyModel.studyNotes.keyMechanism} color="#86efac" />
            )}
            {studyModel.studyNotes.commonConfusion && (
              <InterpretationNote label="Common Confusion" text={studyModel.studyNotes.commonConfusion} color="#fca5a5" />
            )}
            {studyModel.studyNotes.clinicalPearl && (
              <InterpretationNote label="Clinical Pearl" text={studyModel.studyNotes.clinicalPearl} color="#c084fc" />
            )}
            {studyModel.studyNotes.examSignal && (
              <InterpretationNote label="Exam Signal" text={studyModel.studyNotes.examSignal} color="#fde047" />
            )}
          </div>
        </div>
      )}

      {/* ── 5. Missing Sources ────────────────────────────────────── */}
      {missingRecs.length > 0 && (
        <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", color: "rgba(251,191,36,0.6)", marginBottom: 7 }}>
            STRENGTHEN YOUR EVIDENCE
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {missingRecs.map((rec, i) => (
              <button
                key={i}
                type="button"
                onClick={onRequestAdd}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                  borderRadius: 7, textAlign: "left", cursor: "pointer",
                  background: rec.priority === "high" ? "rgba(251,191,36,0.06)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${rec.priority === "high" ? "rgba(251,191,36,0.18)" : "rgba(255,255,255,0.05)"}`,
                }}
              >
                <span style={{ fontSize: 14, flexShrink: 0 }}>{rec.icon}</span>
                <span style={{ fontSize: 9, color: rec.priority === "high" ? "rgba(253,224,71,0.8)" : "rgba(148,163,184,0.65)", lineHeight: 1.4, flex: 1 }}>
                  {rec.label}
                </span>
                <span style={{ fontSize: 8, color: "rgba(148,163,184,0.3)", flexShrink: 0 }}>+</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 5. Source Conflicts ───────────────────────────────────── */}
      {conflicts.length > 0 && (
        <div style={{ padding: "8px 14px 12px", borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setShowConflicts(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: showConflicts ? 8 : 0, width: "100%" }}
          >
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", color: "rgba(248,113,113,0.7)" }}>
              ⚡ {conflicts.length} SOURCE CONFLICT{conflicts.length !== 1 ? "S" : ""}
            </span>
            <span style={{ fontSize: 8, color: "rgba(148,163,184,0.4)", marginLeft: "auto" }}>{showConflicts ? "▲" : "▼"}</span>
          </button>
          {showConflicts && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {conflicts.map((c, i) => (
                <div key={i} style={{ padding: "8px 10px", borderRadius: 7, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.18)" }}>
                  <div style={{ fontSize: 8, color: "rgba(248,113,113,0.8)", fontWeight: 600, marginBottom: 4 }}>{c.reason}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <SourceChip source={c.sourceA} label="Higher authority" />
                    <SourceChip source={c.sourceB} label="Conflicting source" dim />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function HealthBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 8, color: "rgba(148,163,184,0.55)", width: 82, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${value}%`, borderRadius: 2, background: color, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: 8, color, fontVariantNumeric: "tabular-nums", width: 28, textAlign: "right", flexShrink: 0 }}>{value}%</span>
    </div>
  );
}

function SourceEvidenceCard({
  source,
  expanded,
  onToggle,
  onRelationshipChange,
  onConfidenceChange,
  onDelete,
}: {
  source:               LearningSource;
  expanded:             boolean;
  onToggle:             () => void;
  onRelationshipChange: (rel: EvidenceRelationship) => void;
  onConfidenceChange:   (val: number) => void;
  onDelete:             () => void;
}) {
  const provColors = PROVENANCE_COLORS[source.type];
  const rel        = source.relationship;
  const relCfg     = rel ? REL_CONFIG[rel] : null;
  const authColor  = AUTHORITY_BADGE_COLOR[source.authorityLevel];
  const confidence = source.sourceConfidence ?? 80;

  return (
    <div style={{ borderRadius: 8, border: `1px solid ${provColors.border}22`, background: provColors.bg, overflow: "hidden" }}>
      {/* Header row */}
      <button
        type="button"
        onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        {/* Authority dot */}
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: authColor, flexShrink: 0 }} />

        {/* Label */}
        <span style={{ flex: 1, fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {source.label}
        </span>

        {/* Relationship chip */}
        {relCfg && (
          <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: `${relCfg.color}18`, color: relCfg.color, flexShrink: 0 }}>
            {relCfg.emoji} {relCfg.label}
          </span>
        )}

        {/* Authority label */}
        <span style={{ fontSize: 7, color: authColor, fontFamily: "ui-monospace, monospace", fontWeight: 700, flexShrink: 0, opacity: 0.8 }}>
          {AUTHORITY_LABELS[source.authorityLevel].replace("Primary ", "").replace(" Material", "").split(" ")[0].toUpperCase()}
        </span>

        <span style={{ fontSize: 8, color: "rgba(148,163,184,0.3)", flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Excerpt */}
          {source.text && (
            <div style={{ fontSize: 9, color: "rgba(203,213,225,0.7)", lineHeight: 1.6, maxHeight: 64, overflow: "hidden", borderLeft: `2px solid ${provColors.border}40`, paddingLeft: 8 }}>
              {source.text.slice(0, 220)}{source.text.length > 220 ? "…" : ""}
            </div>
          )}

          {/* Thought units count */}
          {source.thoughtUnits.length > 0 && (
            <div style={{ fontSize: 8, color: "rgba(148,163,184,0.5)" }}>
              {source.thoughtUnits.length} extracted thought unit{source.thoughtUnits.length !== 1 ? "s" : ""}
            </div>
          )}

          {/* Relationship picker */}
          <div>
            <div style={{ fontSize: 8, color: "rgba(148,163,184,0.45)", marginBottom: 4, fontWeight: 600 }}>EVIDENCE ROLE</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {ALL_RELATIONSHIPS.map(r => {
                const cfg = REL_CONFIG[r];
                const active = source.relationship === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onRelationshipChange(r)}
                    style={{
                      fontSize: 8, padding: "3px 7px", borderRadius: 5, cursor: "pointer",
                      fontWeight: active ? 700 : 400,
                      background: active ? `${cfg.color}20` : "rgba(255,255,255,0.04)",
                      border: `1px solid ${active ? cfg.color + "50" : "rgba(255,255,255,0.08)"}`,
                      color: active ? cfg.color : "rgba(148,163,184,0.5)",
                    }}
                  >
                    {cfg.emoji} {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Confidence slider */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 8, color: "rgba(148,163,184,0.45)", fontWeight: 600 }}>CONFIDENCE</span>
              <span style={{ fontSize: 8, color: confidence >= 70 ? "#10b981" : confidence >= 40 ? "#f59e0b" : "#f87171", fontVariantNumeric: "tabular-nums", marginLeft: "auto" }}>
                {confidence}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={confidence}
              onChange={e => onConfidenceChange(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#3b82f6" }}
            />
          </div>

          {/* URL + remove */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {source.url && (
              <a href={source.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 8, color: "#60a5fa", textDecoration: "none", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                ↗ {source.url.replace(/^https?:\/\//, "").slice(0, 40)}
              </a>
            )}
            <button
              type="button"
              onClick={onDelete}
              style={{ fontSize: 8, color: "rgba(248,113,113,0.55)", background: "none", border: "none", cursor: "pointer", marginLeft: "auto", padding: 0, flexShrink: 0 }}
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InterpretationNote({ label, text, color }: { label: string; text: string; color: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <div style={{
        fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", flexShrink: 0, marginTop: 2,
        padding: "2px 6px", borderRadius: 4, color, background: `${color}15`,
        border: `1px solid ${color}30`,
      }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 11, color: "rgba(203,213,225,0.85)", lineHeight: 1.6, flex: 1 }}>
        {text}
      </div>
    </div>
  );
}

function SourceChip({ source, label, dim }: { source: LearningSource; label: string; dim?: boolean }) {
  const authColor = AUTHORITY_BADGE_COLOR[source.authorityLevel];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: dim ? 0.7 : 1 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: authColor, flexShrink: 0 }} />
      <span style={{ fontSize: 8, color: "rgba(148,163,184,0.6)" }}>{label}:</span>
      <span style={{ fontSize: 8, color: "rgba(203,213,225,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {source.label}
      </span>
    </div>
  );
}
