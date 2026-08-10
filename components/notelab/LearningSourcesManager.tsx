"use client";

// components/notelab/LearningSourcesManager.tsx
//
// Two-view NoteLab center: Sources (manage inputs) + Guide (adaptive output).
// Subscribes to readingFocusStore.thoughtUnitId so both views stay locked to
// the currently active canonical thought unit across all panels.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useReadingFocusStore } from "@/lib/readingFocus/readingFocusStore";
import {
  loadSourcesForPage,
  saveSource,
  deleteSource,
  updateSource,
  genSourceId,
  PROVENANCE_COLORS,
  PROVENANCE_LABELS,
  AUTHORITY_LABELS,
  AUTHORITY_FOR_TYPE,
  AUTHORITY_PRIORITY,
  type LearningSource,
  type LearningSourceType,
  type SourceAuthority,
} from "@/lib/learningHub/learningSourceStore";
import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";
import type { GroundedSurgeonAnnotation } from "@/lib/highlights/groundSurgeonQuotes";
import { getNodesByDocument } from "@/lib/knowledge/knowledgeGraphStore";
import { getWhiteboardLessonSnapshotsByDocument } from "@/lib/knowledge/whiteboardLessonSnapshotStore";
import type { KnowledgeNode } from "@/lib/knowledge/knowledgeGraphSchema";
import type { WhiteboardLessonSnapshot } from "@/lib/knowledge/whiteboardLessonSnapshotStore";
import {
  buildCanonicalTextbookEvidence,
  buildRecallMaterialPreview,
  buildRelatedConceptPreviews,
  selectCurrentPageFocusId,
  selectEvidenceForConcept,
  selectProfessorSnapshots,
  studyModelMatchesPage,
  type NoteLabPageIdentity,
} from "@/lib/notelab/conceptEvidenceWorkspace";
import EvidenceWorkspace from "./EvidenceWorkspace";

// ── Source catalogue ─────────────────────────────────────────────────────────

interface SourceTypeDef {
  type: LearningSourceType;
  label: string;
  icon: string;
  hint: string;
  authority: SourceAuthority;
}

const SOURCE_CATALOGUE: SourceTypeDef[] = [
  { type: "textbook",        label: "Primary Textbook",   icon: "📖", hint: "Always connected — drives highlights & guide",        authority: "primary-textbook"       },
  { type: "professor_notes", label: "Professor Material", icon: "🎓", hint: "Lecture notes, slides, annotated readings",            authority: "professor-material"     },
  { type: "exam_blueprint",  label: "Exam Blueprint",     icon: "📋", hint: "DAT/MCAT/board objective list for this topic",         authority: "exam-blueprint"         },
  { type: "video",           label: "Uploaded Video",     icon: "▶",  hint: "YouTube link or lecture recording",                    authority: "educational-video"      },
  { type: "article",         label: "Article / Web",      icon: "🔗", hint: "Supplemental reading or evidence source",              authority: "peer-reviewed"          },
  { type: "personal_note",   label: "Personal Notes",     icon: "✏️", hint: "Your own study notes and annotations",                 authority: "personal-note"          },
  { type: "chief_resident",  label: "Chief Resident Save",icon: "🩺", hint: "Saved Chief Resident explanations for this concept",   authority: "ai-explanation"         },
  { type: "recall_mistake",  label: "Recall Mistakes",    icon: "⚠️", hint: "Wrong answers from Recall Lab linked to this topic",   authority: "personal-note"          },
  { type: "whiteboard",      label: "Whiteboard Save",    icon: "🎨", hint: "Saved visual diagrams from Whiteboard",               authority: "ai-explanation"         },
];

// ── View types ────────────────────────────────────────────────────────────────

type PanelView = "evidence" | "sources";
type AddStep = "pick-type" | "enter-content";

interface AddDraft {
  type: LearningSourceType;
  label: string;
  text: string;
  url: string;
}

const EMPTY_DRAFT: AddDraft = { type: "article", label: "", text: "", url: "" };

// ── Props ─────────────────────────────────────────────────────────────────────

interface LearningSourcesManagerProps {
  bookId: string;
  documentId: string;
  currentPage: number;
  pageTruthKey: string;
  surgeonPageTruthKey?: string | null;
  groundedAnnotations?: GroundedSurgeonAnnotation[];
  studyModel?: CurrentPageStudyModel | null;
  onNavigateToPage?: (page: number) => void;
  refreshKey?: number;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function LearningSourcesManager({
  bookId,
  documentId,
  currentPage,
  pageTruthKey,
  surgeonPageTruthKey,
  groundedAnnotations = [],
  studyModel,
  onNavigateToPage,
  refreshKey = 0,
}: LearningSourcesManagerProps) {
  // Active canonical thought unit from the shared focus store
  const focusedUnitId = useReadingFocusStore(s => s.thoughtUnitId);

  const [view, setView] = useState<PanelView>("evidence");
  const [sources, setSources] = useState<LearningSource[]>([]);
  const [professorSnapshots, setProfessorSnapshots] = useState<WhiteboardLessonSnapshot[]>([]);
  const [knowledgeNodes, setKnowledgeNodes] = useState<KnowledgeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [addStep, setAddStep] = useState<AddStep | null>(null);
  const [draft, setDraft] = useState<AddDraft>(EMPTY_DRAFT);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const identity = useMemo<NoteLabPageIdentity>(() => ({
    documentId,
    pageNumber: currentPage,
    pageTruthKey,
  }), [documentId, currentPage, pageTruthKey]);

  // Reject a model from a different page or an older extraction instead of
  // leaving a plausible-looking stale explanation in NoteLab.
  const currentStudyModel = useMemo(
    () => studyModelMatchesPage(studyModel, identity) ? studyModel : null,
    [studyModel, identity],
  );

  const canonicalPageEvidence = useMemo(() => buildCanonicalTextbookEvidence({
    identity,
    surgeonPageTruthKey,
    groundedAnnotations,
  }), [identity, surgeonPageTruthKey, groundedAnnotations]);

  // Reading focus is global and can briefly retain the previous page's id.
  // Adopt it only when the current canonical evidence, exact study model, or
  // current-page Knowledge Graph proves that the id belongs here.
  const activeUnitId = useMemo(() => {
    return selectCurrentPageFocusId({
      focusedUnitId,
      evidence: canonicalPageEvidence,
      studyModel: currentStudyModel,
      knowledgeNodes,
      pageNumber: currentPage,
    });
  }, [focusedUnitId, canonicalPageEvidence, currentStudyModel, knowledgeNodes, currentPage]);

  const conceptEvidence = useMemo(
    () => selectEvidenceForConcept(canonicalPageEvidence, activeUnitId),
    [canonicalPageEvidence, activeUnitId],
  );

  const activeProfessorSnapshots = useMemo(
    () => selectProfessorSnapshots(professorSnapshots, identity, activeUnitId),
    [professorSnapshots, identity, activeUnitId],
  );

  const recallMaterial = useMemo(() => buildRecallMaterialPreview({
    snapshots: activeProfessorSnapshots,
    studyModel: currentStudyModel,
  }), [activeProfessorSnapshots, currentStudyModel]);

  const relatedConcepts = useMemo(
    () => buildRelatedConceptPreviews(knowledgeNodes, activeUnitId, currentPage),
    [knowledgeNodes, activeUnitId, currentPage],
  );

  // Derive active unit label from canonical Surgeon evidence first, with the
  // exact-identity study model as a secondary already-computed source.
  const activeUnitLabel = useMemo(() => {
    if (!activeUnitId) return null;
    const canonical = canonicalPageEvidence.find(item => item.id === activeUnitId);
    if (canonical) return canonical.exactText;
    const anchor = currentStudyModel?.visualAnchors?.find(
      a => a.id === activeUnitId || (a as any).evidenceRefId === activeUnitId
    );
    return anchor ? (anchor.exactText ?? null) : null;
  }, [activeUnitId, canonicalPageEvidence, currentStudyModel]);

  // Load every reusable workspace input under the resolved document identity.
  // State is cleared synchronously and the alive guard prevents a late result
  // from the previous page becoming a silent stale fallback.
  useEffect(() => {
    if (!documentId || !pageTruthKey) return;
    let alive = true;
    setLoading(true);
    setSources([]);
    setProfessorSnapshots([]);
    setKnowledgeNodes([]);
    Promise.all([
      loadSourcesForPage(identity).catch(() => [] as LearningSource[]),
      getWhiteboardLessonSnapshotsByDocument(documentId).catch(() => [] as WhiteboardLessonSnapshot[]),
      getNodesByDocument(documentId).catch(() => [] as KnowledgeNode[]),
    ]).then(([nextSources, nextSnapshots, nextNodes]) => {
      if (!alive) return;
      setSources(nextSources);
      setProfessorSnapshots(nextSnapshots);
      setKnowledgeNodes(nextNodes);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [documentId, currentPage, pageTruthKey, refreshKey]);

  // Sources filtered to the active unit (book-level always included)
  const unitSources = useMemo(() => {
    if (!activeUnitId) return sources;
    return sources.filter(
      s => s.canonicalUnitIds.length === 0 || s.canonicalUnitIds.includes(activeUnitId)
    );
  }, [sources, activeUnitId]);

  // Count by type for the catalogue view
  const countByType = useMemo(() => {
    const map: Partial<Record<LearningSourceType, number>> = {};
    for (const s of sources) {
      map[s.type] = (map[s.type] ?? 0) + 1;
    }
    return map;
  }, [sources]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAdd = useCallback(async () => {
    if (!draft.label.trim() && !draft.text.trim() && !draft.url.trim()) return;
    const def = SOURCE_CATALOGUE.find(d => d.type === draft.type)!;
    const source: LearningSource = {
      id: genSourceId(),
      bookId,
      documentId,
      pageNumber: currentPage,
      pageTruthKey,
      label: draft.label.trim() || def.label,
      type: draft.type,
      authorityLevel: AUTHORITY_FOR_TYPE[draft.type],
      text: draft.text.trim(),
      url: draft.url.trim() || undefined,
      canonicalUnitIds: activeUnitId ? [activeUnitId] : [],
      thoughtUnits: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveSource(source);
    setSources(prev => [source, ...prev]);
    setDraft(EMPTY_DRAFT);
    setAddStep(null);
  }, [draft, bookId, documentId, currentPage, pageTruthKey, activeUnitId]);

  const handleSaveStudentNote = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const source: LearningSource = {
      id: genSourceId(),
      bookId,
      documentId,
      pageNumber: currentPage,
      pageTruthKey,
      label: `Student note · Page ${currentPage}`,
      type: "personal_note",
      authorityLevel: "personal-note",
      text: trimmed,
      canonicalUnitIds: activeUnitId ? [activeUnitId] : [],
      thoughtUnits: [],
      relationship: "questions",
      sourceConfidence: 70,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveSource(source);
    setSources(prev => [source, ...prev]);
  }, [bookId, documentId, currentPage, pageTruthKey, activeUnitId]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteSource(id);
    setSources(prev => prev.filter(s => s.id !== id));
  }, []);

  const handleLinkToUnit = useCallback(async (sourceId: string) => {
    if (!activeUnitId) return;
    const source = sources.find(s => s.id === sourceId);
    if (!source) return;
    const updated: LearningSource = {
      ...source,
      canonicalUnitIds: source.canonicalUnitIds.includes(activeUnitId)
        ? source.canonicalUnitIds
        : [...source.canonicalUnitIds, activeUnitId],
      updatedAt: Date.now(),
    };
    await updateSource(updated);
    setSources(prev => prev.map(s => s.id === sourceId ? updated : s));
    setLinkingId(null);
  }, [sources, activeUnitId]);

  const handleUnlinkFromUnit = useCallback(async (sourceId: string) => {
    if (!activeUnitId) return;
    const source = sources.find(s => s.id === sourceId);
    if (!source) return;
    const updated: LearningSource = {
      ...source,
      canonicalUnitIds: source.canonicalUnitIds.filter(id => id !== activeUnitId),
      updatedAt: Date.now(),
    };
    await updateSource(updated);
    setSources(prev => prev.map(s => s.id === sourceId ? updated : s));
  }, [sources, activeUnitId]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[rgb(11,18,34)] text-slate-200">

      {/* Header */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2 border-b border-white/8">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500 cursor-pointer hover:text-slate-300"
            style={{ letterSpacing: "0.12em" }}
          >
            Learning Source Graph
          </div>
          <div className="flex-1" />
          <button
            onClick={() => { setAddStep("pick-type"); setDraft(EMPTY_DRAFT); }}
            className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/40 border border-emerald-700/30 text-emerald-300 hover:bg-emerald-800/50 transition-colors"
          >
            + Add Source
          </button>
        </div>

        {/* View toggle */}
        <div className="flex gap-1">
          {([
            { key: "evidence", label: "Evidence" },
            { key: "sources",  label: "Sources"  },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`px-3 py-1 rounded text-[11px] font-medium transition-colors ${
                view === key
                  ? "bg-slate-700 text-slate-100"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Active unit strip */}
      {activeUnitId && (
        <div className="flex-shrink-0 px-3 py-1.5 border-b border-white/8 bg-yellow-500/5">
          <div className="text-[9px] uppercase tracking-widest text-yellow-500/60 mb-0.5">Active Concept</div>
          <div className="text-[11px] text-yellow-300/90 leading-snug line-clamp-2">
            {activeUnitLabel ?? activeUnitId}
          </div>
        </div>
      )}

      {/* Add-source flow */}
      {addStep && (
        <div className="flex-shrink-0 border-b border-white/8 bg-slate-800/40">
          {addStep === "pick-type" ? (
            <div className="p-3">
              <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">Select source type</div>
              <div className="grid grid-cols-3 gap-1.5">
                {SOURCE_CATALOGUE.map(def => {
                  const col = PROVENANCE_COLORS[def.type];
                  return (
                    <button
                      key={def.type}
                      onClick={() => { setDraft(d => ({ ...d, type: def.type })); setAddStep("enter-content"); }}
                      className="flex flex-col items-center gap-1 rounded-lg p-2 border text-center transition-colors hover:opacity-90"
                      style={{ borderColor: col.border, background: col.bg }}
                    >
                      <span className="text-base">{def.icon}</span>
                      <span className="text-[9px] font-semibold leading-tight" style={{ color: col.text }}>
                        {def.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setAddStep(null)}
                className="mt-2 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-slate-400">
                  {SOURCE_CATALOGUE.find(d => d.type === draft.type)?.icon} {PROVENANCE_LABELS[draft.type]}
                </span>
                <div
                  className="text-[9px] px-1.5 py-0.5 rounded"
                  style={{
                    background: PROVENANCE_COLORS[draft.type].bg,
                    color: PROVENANCE_COLORS[draft.type].text,
                    border: `1px solid ${PROVENANCE_COLORS[draft.type].border}`,
                  }}
                >
                  {AUTHORITY_LABELS[AUTHORITY_FOR_TYPE[draft.type]]}
                </div>
              </div>
              <input
                type="text"
                placeholder="Label (optional)"
                value={draft.label}
                onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
                className="text-xs rounded border border-slate-700 bg-slate-900 text-slate-200 px-2 py-1.5 focus:outline-none focus:border-slate-500"
              />
              {(draft.type === "video" || draft.type === "article") && (
                <input
                  type="text"
                  placeholder="URL (paste link)"
                  value={draft.url}
                  onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
                  className="text-xs rounded border border-slate-700 bg-slate-900 text-slate-200 px-2 py-1.5 focus:outline-none focus:border-slate-500"
                />
              )}
              <textarea
                placeholder="Paste content, notes, or key points…"
                value={draft.text}
                onChange={e => setDraft(d => ({ ...d, text: e.target.value }))}
                rows={4}
                className="text-xs rounded border border-slate-700 bg-slate-900 text-slate-200 px-2 py-1.5 focus:outline-none focus:border-slate-500 resize-none"
              />
              {activeUnitId && (
                <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <span>●</span> Will be linked to active concept
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={!draft.label.trim() && !draft.text.trim() && !draft.url.trim()}
                  className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-[11px] font-semibold text-white transition-colors disabled:opacity-40"
                >
                  Save Source
                </button>
                <button
                  onClick={() => setAddStep("pick-type")}
                  className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setAddStep(null)}
                  className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors ml-auto"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-center text-slate-500 text-xs">Loading sources…</div>
        ) : view === "evidence" ? (
          <EvidenceWorkspace
            sources={unitSources}
            activeUnitId={activeUnitId}
            activeUnitLabel={activeUnitLabel}
            studyModel={currentStudyModel}
            canonicalEvidence={conceptEvidence}
            professorSnapshots={activeProfessorSnapshots}
            recallMaterial={recallMaterial}
            relatedConcepts={relatedConcepts}
            onUpdateSource={(s) => setSources(prev => prev.map(x => x.id === s.id ? s : x))}
            onDeleteSource={handleDelete}
            onSaveStudentNote={handleSaveStudentNote}
            onRequestAdd={() => { setAddStep("pick-type"); setDraft(EMPTY_DRAFT); }}
          />
        ) : (
          <SourcesView
            sources={sources}
            unitSources={unitSources}
            activeUnitId={activeUnitId}
            countByType={countByType}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
            linkingId={linkingId}
            setLinkingId={setLinkingId}
            onDelete={handleDelete}
            onLinkToUnit={handleLinkToUnit}
            onUnlinkFromUnit={handleUnlinkFromUnit}
            canonicalEvidenceCount={canonicalPageEvidence.length}
          />
        )}
      </div>
    </div>
  );
}

// ── Sources view ──────────────────────────────────────────────────────────────

function SourcesView({
  sources,
  unitSources,
  activeUnitId,
  countByType,
  expandedId,
  setExpandedId,
  linkingId,
  setLinkingId,
  onDelete,
  onLinkToUnit,
  onUnlinkFromUnit,
  canonicalEvidenceCount,
}: {
  sources: LearningSource[];
  unitSources: LearningSource[];
  activeUnitId: string | null;
  countByType: Partial<Record<LearningSourceType, number>>;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  linkingId: string | null;
  setLinkingId: (id: string | null) => void;
  onDelete: (id: string) => void;
  onLinkToUnit: (id: string) => void;
  onUnlinkFromUnit: (id: string) => void;
  canonicalEvidenceCount: number;
}) {
  return (
    <div className="flex flex-col">
      {/* Catalogue of source types */}
      <div className="p-3 border-b border-white/8">
        <div className="text-[9px] uppercase tracking-widest text-slate-500 mb-2">Source Library</div>
        <div className="flex flex-col gap-1">
          {SOURCE_CATALOGUE.map(def => {
            const col = PROVENANCE_COLORS[def.type];
            const count = countByType[def.type] ?? 0;
            const isTextbook = def.type === "textbook";
            return (
              <div
                key={def.type}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 border transition-colors"
                style={{ borderColor: count > 0 ? col.border : "rgba(51,65,85,0.5)", background: count > 0 ? col.bg : "transparent" }}
              >
                <span className="text-sm w-5 text-center flex-shrink-0">{def.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium leading-tight" style={{ color: count > 0 ? col.text : "#64748b" }}>
                    {def.label}
                  </div>
                  <div className="text-[9px] text-slate-600 truncate">{def.hint}</div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {isTextbook ? (
                    <span className={`text-[9px] font-semibold ${canonicalEvidenceCount > 0 ? "text-emerald-400" : "text-slate-600"}`}>
                      {canonicalEvidenceCount > 0 ? `${canonicalEvidenceCount} grounded` : "Awaiting Surgeon"}
                    </span>
                  ) : count > 0 ? (
                    <span className="text-[9px] font-semibold" style={{ color: col.text }}>{count} item{count !== 1 ? "s" : ""}</span>
                  ) : (
                    <span className="text-[9px] text-slate-600">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Attached sources list */}
      {sources.length === 0 ? (
        <div className="p-6 text-center">
          <div className="text-2xl mb-2">📚</div>
          <div className="text-xs text-slate-500">No sources attached yet</div>
          <div className="text-[10px] text-slate-600 mt-1">Use + Add Source to attach lecture notes, videos, articles, and more</div>
        </div>
      ) : (
        <div className="p-3 flex flex-col gap-2">
          <div className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">
            Attached Sources {activeUnitId && <span className="text-yellow-500/60">· {unitSources.length} for active concept</span>}
          </div>
          {sources.map(source => {
            const col = PROVENANCE_COLORS[source.type];
            const isExpanded = expandedId === source.id;
            const isLinkedToUnit = activeUnitId ? source.canonicalUnitIds.includes(activeUnitId) : false;
            const isBookLevel = source.canonicalUnitIds.length === 0;

            return (
              <div
                key={source.id}
                className="rounded-lg border overflow-hidden"
                style={{ borderColor: col.border, background: col.bg }}
              >
                {/* Source header */}
                <div className="flex items-start gap-2 px-2 py-2">
                  <span className="text-sm flex-shrink-0 mt-0.5">
                    {SOURCE_CATALOGUE.find(d => d.type === source.type)?.icon ?? "📄"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold leading-tight" style={{ color: col.text }}>
                      {source.label}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                      <span
                        className="text-[9px] px-1 py-px rounded"
                        style={{ background: "rgba(0,0,0,0.3)", color: col.text }}
                      >
                        {AUTHORITY_LABELS[source.authorityLevel]}
                      </span>
                      {isBookLevel ? (
                        <span className="text-[9px] text-slate-500">Book-level</span>
                      ) : isLinkedToUnit ? (
                        <span className="text-[9px] text-yellow-400/70">● This concept</span>
                      ) : (
                        <span className="text-[9px] text-slate-600">{source.canonicalUnitIds.length} concept{source.canonicalUnitIds.length !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : source.id)}
                    className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0 text-xs"
                  >
                    {isExpanded ? "▲" : "▼"}
                  </button>
                </div>

                {/* Expanded actions */}
                {isExpanded && (
                  <div className="px-2 pb-2 border-t border-white/8 pt-2 flex flex-col gap-2">
                    {source.text && (
                      <div className="text-[10px] text-slate-400 bg-black/20 rounded p-2 max-h-24 overflow-y-auto leading-relaxed">
                        {source.text.slice(0, 400)}{source.text.length > 400 ? "…" : ""}
                      </div>
                    )}
                    {source.url && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] underline"
                        style={{ color: col.text }}
                      >
                        Open source ↗
                      </a>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      {activeUnitId && !isLinkedToUnit && !isBookLevel && (
                        <button
                          onClick={() => onLinkToUnit(source.id)}
                          className="text-[10px] px-2 py-1 rounded bg-yellow-900/30 border border-yellow-700/30 text-yellow-300 hover:bg-yellow-800/40 transition-colors"
                        >
                          Link to active concept
                        </button>
                      )}
                      {activeUnitId && isLinkedToUnit && !isBookLevel && (
                        <button
                          onClick={() => onUnlinkFromUnit(source.id)}
                          className="text-[10px] px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-red-400 transition-colors"
                        >
                          Unlink from concept
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(source.id)}
                        className="text-[10px] px-2 py-1 rounded bg-red-900/20 border border-red-800/20 text-red-400 hover:bg-red-900/40 transition-colors ml-auto"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
