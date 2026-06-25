"use client";
// components/studyguide/StudyGuideLab.tsx
// Study Guide Architect — builds a top-student notebook from multiple source PDFs + notes.
// Philosophy: "What would a 25 DAT student keep if they had 2 months before the exam?"

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  STUDY_GUIDE_MODE_LABELS,
  STUDY_GUIDE_MODE_DESCRIPTIONS,
  EXAM_GOAL_LABELS,
  DAT_TARGET_SCORES,
  type StudyGuideMode,
  type StudyGuideRecord,
  type ExamGoal,
} from "@/lib/studyguide/types";
import {
  saveStudyGuide,
  getAllStudyGuides,
  deleteStudyGuide,
  getStudyGuidesByBook,
} from "@/lib/studyguide/studyGuideStore";
import { saveUltraNote, buildUltraNote } from "@/lib/notelab/ultraNoteStore";
import { saveRecallSet, stableRecallId } from "@/lib/recalllab/recallStore";
import type { RecallSet, RecallCard } from "@/lib/recalllab/recallStore";
import type { PodcastScript, PodcastSegment } from "@/lib/podcast/podcastTypes";
import type { CurrentPageStudyModel } from "@/lib/insights/currentPageStudyModel";

// ── Types ──────────────────────────────────────────────────────────────────

interface SourceSlot {
  id: string;
  label: string;
  placeholder: string;
  text: string;
  fileName?: string;
  loading: boolean;
  required?: boolean;
}

interface StudyGuideLabProps {
  bookId: string;
  bookTitle?: string;
  currentPage?: number;
  studyModel?: CurrentPageStudyModel | null;
  pageText?: string;
  onNavigateToPage?: (page: number) => void;
  onNoteSaved?: (noteId: string) => void;
  onRecallSaved?: (setId: string) => void;
  onPodcastScript?: (script: PodcastScript) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function genId(): string {
  return `sg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function exportToMarkdown(guide: StudyGuideRecord): string {
  const lines: string[] = [
    `# ${guide.chapterTitle}`,
    `## ${guide.topic}`,
    `Priority: ${guide.priority ?? "Medium"}${guide.examGoal ? ` · Exam Goal: ${EXAM_GOAL_LABELS[guide.examGoal]}${guide.targetScore ? ` (target ${guide.targetScore})` : ""}` : ""}`,
    "",
    "### Must Know",
    ...guide.mustKnow.map(f => `- ${f}`),
    "",
    "### DAT High-Yield Facts",
    ...guide.datFacts.map(f => `⭐ ${f}`),
    "",
    "### Mechanism Maps",
    ...guide.mechanisms.flatMap(m => [
      `**${m.title}**`,
      ...m.steps.map((s, i) => (i === 0 ? s : `   ↓\n${s}`)),
      "",
    ]),
    "### Common DAT Traps",
    ...guide.traps.map(t => `- ⚠ ${t}`),
    "",
    "### Recall Questions",
    ...guide.recallQuestions.map((q, i) => `${i + 1}. ${q}`),
    "",
    "### Memory Hooks",
    ...guide.memoryHooks.map(h => `> ${h}`),
    "",
    "### Daily Study Tasks",
    ...(guide.dailyTasks ?? []).map(t => `- [ ] ${t}`),
  ];
  return lines.join("\n");
}

// ── Podcast script builder ────────────────────────────────────────────────

function buildPodcastScriptFromGuide(guide: StudyGuideRecord, pageNumber: number, bookId: string): PodcastScript {
  const segments: PodcastSegment[] = [];
  let id = 0;
  const mk = () => `sg-seg-${id++}`;

  // Intro
  segments.push({
    id: mk(), type: "intro", speaker: "host",
    text: `Today we're reviewing ${guide.topic || guide.chapterTitle}. ${guide.mustKnow[0] ?? ""}`,
  });

  // Must Know — one segment each
  guide.mustKnow.forEach((item, i) => {
    segments.push({ id: mk(), type: "right_panel_note", speaker: i % 2 === 0 ? "host" : "guest", text: item });
  });

  // Mechanisms
  guide.mechanisms.forEach(m => {
    const text = `${m.title}: ${m.steps.join(" → ")}`;
    segments.push({ id: mk(), type: "highlight_evidence", speaker: "host", text });
  });

  // Traps
  guide.traps.forEach(t => {
    segments.push({ id: mk(), type: "notelab_expansion", speaker: "guest", text: `Watch out: ${t}` });
  });

  // Recall questions
  guide.recallQuestions.forEach(q => {
    segments.push({ id: mk(), type: "recall_quiz", speaker: "host", text: q });
  });

  // Memory hooks
  guide.memoryHooks.forEach(h => {
    segments.push({ id: mk(), type: "notelab_expansion", speaker: "narrator", text: `Memory hook: ${h}` });
  });

  // Outro
  segments.push({
    id: mk(), type: "outro", speaker: "host",
    text: `That wraps up ${guide.topic || guide.chapterTitle}. Review these recall questions and come back tomorrow.`,
  });

  return {
    mode: "page_review",
    pageNumber,
    bookId,
    segments,
    totalSegments: segments.length,
    estimatedMinutes: Math.max(1, Math.ceil(segments.length * 0.4)),
  };
}

// ── Collapsible panel — Reader/Panel-style expandable sections ─────────────

function CollapsiblePanel({
  title, subtitle, defaultOpen = false, children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-800">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-900/50 transition-colors"
      >
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</div>
          {subtitle && <div className="text-[11px] text-slate-600 mt-0.5 truncate">{subtitle}</div>}
        </div>
        <span className="text-slate-500 text-xs flex-shrink-0 ml-2">{open ? "▼" : "▶"}</span>
      </button>
      {open && <div className="px-4 pb-4 flex flex-col gap-3">{children}</div>}
    </div>
  );
}

// ── Section components ─────────────────────────────────────────────────────

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  const colorMap: Record<string, string> = {
    yellow: "border-yellow-500/40 bg-yellow-950/20",
    green:  "border-green-500/40 bg-green-950/20",
    orange: "border-orange-500/40 bg-orange-950/20",
    red:    "border-red-500/40 bg-red-950/20",
    blue:   "border-blue-500/40 bg-blue-950/20",
    purple: "border-purple-500/40 bg-purple-950/20",
  };
  const titleMap: Record<string, string> = {
    yellow: "text-yellow-300",
    green:  "text-green-300",
    orange: "text-orange-300",
    red:    "text-red-300",
    blue:   "text-blue-300",
    purple: "text-purple-300",
  };
  return (
    <div className={`rounded-xl border ${colorMap[color] ?? "border-slate-700 bg-slate-900"} p-4`}>
      <div className={`text-[10px] font-bold uppercase tracking-[0.15em] mb-3 ${titleMap[color] ?? "text-slate-400"}`}>
        {title}
      </div>
      {children}
    </div>
  );
}

function MechanismMap({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="text-xs font-semibold text-slate-300 mb-2">{title}</div>
      <div className="flex flex-col items-start gap-0">
        {steps.map((step, i) => (
          <React.Fragment key={i}>
            <div className="px-3 py-1.5 rounded-lg bg-green-950/50 border border-green-700/40 text-green-200 text-sm min-w-[120px]">
              {step}
            </div>
            {i < steps.length - 1 && (
              <div className="text-green-500 text-base font-bold ml-4 leading-none py-0.5">↓</div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function UploadZone({
  slot,
  onTextChange,
  onFileLoad,
}: {
  slot: SourceSlot;
  onTextChange: (id: string, text: string) => void;
  onFileLoad: (id: string, file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
          {slot.required && <span className="text-orange-400">*</span>}
          {slot.label}
          {slot.fileName && (
            <span className="ml-1 text-[10px] text-slate-500 font-normal">({slot.fileName})</span>
          )}
        </label>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={slot.loading}
          className="text-[10px] px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors disabled:opacity-50"
        >
          {slot.loading ? "Loading…" : "📄 Upload PDF"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFileLoad(slot.id, f);
            e.target.value = "";
          }}
        />
      </div>
      <textarea
        value={slot.text}
        onChange={(e) => onTextChange(slot.id, e.target.value)}
        placeholder={slot.placeholder}
        rows={4}
        className="w-full rounded-lg bg-slate-800 border border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 text-sm text-slate-200 placeholder:text-slate-600 px-3 py-2 resize-none outline-none transition-colors"
      />
    </div>
  );
}

// ── Detect chapter/topic from page text and study model ────────────────────
//
// Priority:
//   1. Concept title   "Concept 2.1: Matter consists of…"
//   2. Section title   "Elements and Compounds"
//   3. Chapter title   "The Chemical Context of Life"
//   4. First concept block title from study model
//   5. Empty (user fills manually)
//
// Never use pageThesis — it is a summary sentence, not a heading.

function detectTopicFromPage(
  studyModel: CurrentPageStudyModel,
  pageText?: string,
): { chapterTitle: string; topic: string } {
  let chapter = "";
  let topic   = "";

  if (pageText && pageText.length > 20) {
    const lines = pageText
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // 1. Concept title — "Concept 2.1: …" or "CONCEPT 2.1 …"
    const conceptRe = /^concept\s+\d+[\.\d]*[:\s–—-]+(.+)/i;
    for (const line of lines.slice(0, 40)) {
      const m = line.match(conceptRe);
      if (m) {
        topic = line.slice(0, 100).trim();
        console.log("[CONCEPT_DETECTED]", { topic });
        break;
      }
    }

    // 2. Section heading — numbered "2.3 Elements and Compounds" or ALL-CAPS short line
    if (!topic) {
      const sectionRe = /^\d+[\.\d]+\s+([A-Z][^.!?]{5,60})$/;
      const allCapsRe = /^[A-Z][A-Z\s,&/-]{4,55}$/;
      for (const line of lines.slice(0, 50)) {
        if (sectionRe.test(line) || allCapsRe.test(line)) {
          topic = line.slice(0, 100).trim();
          console.log("[SECTION_DETECTED]", { topic });
          break;
        }
      }
    }

    // 3. Chapter heading — "Chapter N: …" or "CHAPTER N …"
    if (!chapter) {
      const chapterRe = /^chapter\s+\d+[:\s–—-]+(.+)/i;
      for (const line of lines.slice(0, 30)) {
        const m = line.match(chapterRe);
        if (m) {
          chapter = line.slice(0, 100).trim();
          console.log("[CHAPTER_DETECTED]", { chapter });
          break;
        }
      }
    }
  }

  // 4. Fall back to first concept block title
  if (!topic && studyModel.conceptBlocks?.length > 0) {
    const titles = studyModel.conceptBlocks.map((b) => b.title).filter(Boolean);
    if (titles.length === 1) {
      topic = titles[0].slice(0, 100);
    } else if (titles.length > 1) {
      // Use the common prefix/theme if titles share words, else join the first two
      topic = titles.slice(0, 2).join(" · ").slice(0, 100);
    }
    if (topic) console.log("[TOPIC_SELECTED]", { source: "concept-block-title", topic });
  }

  console.log("[TOPIC_SELECTED]", { chapter: chapter || "(empty)", topic: topic || "(empty)" });
  return { chapterTitle: chapter, topic };
}

// ── Build structured source text from Right Panel study model ──────────────

function buildStudyModelSourceText(sm: CurrentPageStudyModel, pageText?: string): string {
  const lines: string[] = [];
  lines.push(`PAGE THESIS: ${sm.pageThesis}`);
  if (sm.studyNotes.keyMechanism)    lines.push(`KEY MECHANISM: ${sm.studyNotes.keyMechanism}`);
  if (sm.studyNotes.whyThisMatters)  lines.push(`WHY THIS MATTERS: ${sm.studyNotes.whyThisMatters}`);
  if (sm.studyNotes.commonConfusion) lines.push(`COMMON CONFUSION: ${sm.studyNotes.commonConfusion}`);
  if (sm.studyNotes.quickMemory)     lines.push(`MEMORY HOOK: ${sm.studyNotes.quickMemory}`);
  if (sm.studyNotes.reasoningFlow)   lines.push(`REASONING FLOW: ${sm.studyNotes.reasoningFlow}`);
  if (sm.studyNotes.examSignal)      lines.push(`EXAM SIGNAL: ${sm.studyNotes.examSignal}`);

  if (sm.conceptBlocks?.length > 0) {
    lines.push("\nCONCEPT BLOCKS:");
    sm.conceptBlocks.forEach((cb, i) => {
      lines.push(`  ${i + 1}. ${cb.title}: ${cb.pattern}`);
      if (cb.mechanism) lines.push(`     Mechanism: ${cb.mechanism}`);
      if (cb.trap)      lines.push(`     Trap: ${cb.trap}`);
      if (cb.rule)      lines.push(`     Rule: ${cb.rule}`);
    });
  }

  if (sm.visualAnchors?.length > 0) {
    lines.push("\nHIGH-YIELD ANCHORS:");
    sm.visualAnchors.slice(0, 6).forEach(a => {
      lines.push(`  [${a.role?.toUpperCase() ?? "FACT"}] ${a.exactText}`);
    });
  }

  if (pageText && pageText.length > 80) {
    lines.push("\nRAW PAGE TEXT (first 2000 chars):");
    lines.push(pageText.slice(0, 2000));
  }

  return lines.join("\n");
}

// ── Main component ─────────────────────────────────────────────────────────

export default function StudyGuideLab({
  bookId,
  bookTitle,
  currentPage,
  studyModel,
  pageText,
  onNavigateToPage,
  onNoteSaved,
  onRecallSaved,
  onPodcastScript,
}: StudyGuideLabProps) {
  const [sources, setSources] = useState<SourceSlot[]>([
    { id: "textbook",  label: "Source 1 — Textbook / Lecture Notes", placeholder: "Paste textbook chapter text, or upload the PDF above…", text: "", loading: false, required: true },
    { id: "blueprint", label: "Source 2 — Study Guide / DAT Blueprint", placeholder: "Paste your study guide or DAT blueprint outline…", text: "", loading: false },
    { id: "professor", label: "Source 3 — Professor Notes / Study Guide", placeholder: "Paste professor notes or slides text…", text: "", loading: false },
    { id: "personal",  label: "Source 4 — Your Own Notes (optional)", placeholder: "Any personal notes you want merged in…", text: "", loading: false },
  ]);

  const [chapterTitle, setChapterTitle] = useState("");
  const [topic, setTopic]               = useState("");
  const [mode, setMode]                 = useState<StudyGuideMode>("dat");
  const [examGoal, setExamGoal]         = useState<ExamGoal | null>(null);
  const [targetScore, setTargetScore]   = useState<string | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [provider, setProvider]         = useState<string | null>(null);

  const [currentGuide, setCurrentGuide] = useState<StudyGuideRecord | null>(null);
  const [history, setHistory]           = useState<StudyGuideRecord[]>([]);
  const [historyTab, setHistoryTab]     = useState<"build" | "history">("build");

  const [noteSaved, setNoteSaved]       = useState(false);
  const [recallSaved, setRecallSaved]   = useState(false);
  const [saveError, setSaveError]       = useState<string | null>(null);

  // Load history on mount
  useEffect(() => {
    getStudyGuidesByBook(bookId).then(setHistory).catch(() => {});
  }, [bookId]);

  // Reset build state when the active document changes — without this, switching
  // PDFs left the previous book's generated guide, chapter/topic, and auto-filled
  // source text visible in the Build tab even though History now shows the new book.
  const isFirstBookRef = useRef(true);
  useEffect(() => {
    if (isFirstBookRef.current) { isFirstBookRef.current = false; return; }
    setCurrentGuide(null);
    setChapterTitle("");
    setTopic("");
    setSources(prev => prev.map(s => ({ ...s, text: "", fileName: undefined })));
    setHistoryTab("build");
    setNoteSaved(false);
    setRecallSaved(false);
    setSaveError(null);
    setError(null);
    setProvider(null);
    console.log("[STUDYGUIDE_BOOKID_CHANGED]", { bookId });
  }, [bookId]);

  // Auto-populate from live Reader study model whenever it changes
  useEffect(() => {
    if (!studyModel) return;
    const sourceText = buildStudyModelSourceText(studyModel, pageText);
    setSources(prev => prev.map(s =>
      s.id === "textbook"
        ? { ...s, text: sourceText, fileName: `Page ${currentPage ?? studyModel.page} — Live Reader Context` }
        : s
    ));

    // Detect structured headings — never use pageThesis as a topic
    const detected = detectTopicFromPage(studyModel, pageText);

    // Chapter: prefer detected heading, fall back to book title, never force-overwrite user edits
    if (!chapterTitle) {
      const ch = detected.chapterTitle || bookTitle?.replace(/\.pdf$/i, "").slice(0, 80) || "";
      if (ch) setChapterTitle(ch);
    }
    // Topic: prefer detected heading, fall back to first concept block title
    if (!topic && detected.topic) {
      setTopic(detected.topic);
    }

    console.log("[STUDYGUIDE_MODEL_LOADED]", {
      page: studyModel.page,
      detectedChapter: detected.chapterTitle || "(none)",
      detectedTopic:   detected.topic        || "(none)",
      conceptBlocks:   studyModel.conceptBlocks?.length ?? 0,
      anchors:         studyModel.visualAnchors?.length ?? 0,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyModel, pageText]);

  // ── PDF extraction ─────────────────────────────────────────────────────

  const handleFileLoad = useCallback(async (slotId: string, file: File) => {
    setSources(prev => prev.map(s => s.id === slotId ? { ...s, loading: true, fileName: file.name } : s));
    try {
      // Dynamic import — avoids bundling pdfjs-dist in SSR
      const { extractTextFromPdf } = await import("@/lib/pdfjs-handler");
      const text = await extractTextFromPdf(file);
      setSources(prev => prev.map(s => s.id === slotId ? { ...s, loading: false, text: text.slice(0, 12000) } : s));
      // Auto-detect chapter title from first lines if not already set
      if (!chapterTitle) {
        const firstLines = text.slice(0, 400);
        const chapterMatch = firstLines.match(/(?:chapter|unit|section)\s+\d+[:\s–—-]+([^\n]{5,80})/i);
        if (chapterMatch) setChapterTitle(chapterMatch[0].trim().slice(0, 80));
      }
    } catch (e) {
      setSources(prev => prev.map(s => s.id === slotId ? { ...s, loading: false } : s));
      setError(`PDF extraction failed: ${String(e)}`);
    }
  }, []);

  const handleTextChange = useCallback((slotId: string, text: string) => {
    setSources(prev => prev.map(s => s.id === slotId ? { ...s, text } : s));
  }, []);

  // ── Generation ─────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    const activeSources = sources.filter(s => s.text.trim().length > 0);

    // If the user has a live study model but no manual sources, we still have the
    // textbook slot auto-populated from the model — so this check handles both cases.
    const hasLiveModel = !!studyModel;
    if (activeSources.length === 0 && !hasLiveModel) {
      setError("Add at least one source document to generate a study guide.");
      return;
    }

    setLoading(true);
    setError(null);
    setProvider(null);
    setNoteSaved(false);
    setRecallSaved(false);
    setSaveError(null);

    // Build the ordered source list:
    // 1. RIGHT PANEL STUDY MODEL always first (if present) — it is the grounding truth
    // 2. Then any user-supplied text slots
    const studyModelSource = studyModel
      ? [{ label: "RIGHT PANEL STUDY MODEL", text: buildStudyModelSourceText(studyModel, pageText) }]
      : [];
    const userSources = activeSources
      .filter(s => s.id !== "textbook" || !studyModel) // skip textbook slot if model already covers it
      .map(s => ({ label: s.label, text: s.text }));

    const finalSources = [...studyModelSource, ...userSources];
    if (finalSources.length === 0) {
      setError("No source material available. Open a book in the Reader first, or paste text above.");
      setLoading(false);
      return;
    }

    // Auto-fill chapter/topic from study model if still empty — never use pageThesis
    const fallback = studyModel ? detectTopicFromPage(studyModel, pageText) : { chapterTitle: "", topic: "" };
    const effectiveChapterTitle = chapterTitle
      || fallback.chapterTitle
      || (bookTitle?.replace(/\.pdf$/i, "").slice(0, 80) ?? "");
    const effectiveTopic = topic || fallback.topic;

    if (studyModel) {
      console.log("[STUDYLAB_READER_CONTEXT_USED]", {
        page: currentPage ?? studyModel.page,
        conceptBlocks: studyModel.conceptBlocks?.length ?? 0,
        anchors: studyModel.visualAnchors?.length ?? 0,
        hasMiniTest: (studyModel.miniTest?.length ?? 0) > 0,
      });
    }

    console.log("[STUDYGUIDE_GENERATE_START]", {
      hasSM: !!studyModel, page: currentPage, sourcesCount: finalSources.length,
      chapterTitle: effectiveChapterTitle, topic: effectiveTopic,
    });

    try {
      const resp = await fetch("/api/study-guide-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sources: finalSources,
          chapterTitle: effectiveChapterTitle,
          topic: effectiveTopic,
          mode,
          hasStudyModel: !!studyModel,
          examGoal: examGoal ?? undefined,
          targetScore: targetScore ?? undefined,
        }),
      });

      const data = await resp.json();
      setProvider(data.provider ?? "unknown");

      if (data.error && data.provider === "fallback") {
        setError(data.error);
      }

      const record: StudyGuideRecord = {
        id:            genId(),
        bookId,
        mode,
        examGoal:      examGoal ?? undefined,
        targetScore:   targetScore ?? undefined,
        sourceLabels:  finalSources.map(s => s.label),
        createdAt:     Date.now(),
        ...data.guide,
        // Ensure chapter/topic fall back to our effective values if AI left them empty
        chapterTitle:  data.guide?.chapterTitle || effectiveChapterTitle,
        topic:         data.guide?.topic        || effectiveTopic,
      };

      setCurrentGuide(record);
      await saveStudyGuide(record);
      const updated = await getStudyGuidesByBook(bookId);
      setHistory(updated);
      setHistoryTab("build");

      console.log("[STUDYGUIDE_GENERATED]", {
        id: record.id, mode, provider: data.provider,
        mustKnow: record.mustKnow.length, datFacts: record.datFacts.length,
      });

      const outputIsValid =
        record.mustKnow.length > 0 &&
        record.chapterTitle.length > 0;
      console.log("[STUDYLAB_OUTPUT_SCHEMA_VALID]", {
        valid: outputIsValid,
        mustKnow: record.mustKnow.length,
        mechanisms: record.mechanisms?.length ?? 0,
        traps: record.traps?.length ?? 0,
        recallQuestions: record.recallQuestions?.length ?? 0,
        chapterTitle: record.chapterTitle,
        topic: record.topic,
      });

      // ── Auto-save to NoteLab ───────────────────────────────────────────
      try {
        const concepts = record.mustKnow.slice(0, 3).map((text, i) => ({
          ordinal:        i + 1,
          title:          `Must Know ${i + 1}`,
          pattern:        text,
          surgicalReason: record.datFacts[i] ?? "",
          trap:           record.traps[i] ?? "",
          rule:           record.memoryHooks[i] ?? "",
        }));
        const note = buildUltraNote(
          bookId,
          currentPage ?? 0,
          record.topic || record.chapterTitle,
          record.mustKnow[0] ?? "See study guide",
          concepts,
          bookTitle,
          undefined,
          record.mustKnow[0] ?? undefined,
          record.recallQuestions.slice(0, 4),
        );
        await saveUltraNote(note);
        setNoteSaved(true);
        onNoteSaved?.(note.id);
        console.log("[STUDYGUIDE_AUTO_SAVED_TO_NOTELAB]", { guideId: record.id, noteId: note.id });
      } catch (e) {
        setSaveError(`NoteLab auto-save failed: ${String(e)}`);
      }

      // ── Auto-save to RecallLab ────────────────────────────────────────
      try {
        const cards: RecallCard[] = [
          ...record.recallQuestions.map((q, i): RecallCard => ({
            id: `sgrc-q${i}`,
            type: "dat-question",
            front: q,
            back: record.mustKnow[i] ?? record.datFacts[i] ?? "See study guide",
            reviewCount: 0,
            isMissed: false,
            difficulty: "medium",
          })),
          ...record.datFacts.map((f, i): RecallCard => ({
            id: `sgrc-f${i}`,
            type: "fact",
            front: `DAT Fact: ${f.split("→")[0]?.trim() ?? f}`,
            back: f,
            reviewCount: 0,
            isMissed: false,
            difficulty: "hard",
          })),
          ...record.traps.map((t, i): RecallCard => ({
            id: `sgrc-t${i}`,
            type: "concept",
            front: `⚠️ Common trap: ${t}`,
            back: `Avoid confusing: ${t}`,
            reviewCount: 0,
            isMissed: false,
            difficulty: "hard",
          })),
        ];
        const set: RecallSet = {
          id: stableRecallId(bookId, currentPage ?? 0, "sg"),
          bookId,
          bookTitle:   bookTitle ?? undefined,
          sourceLabel: "study-guide",
          pageNumber:  currentPage ?? 0,
          subject:     "Biology",
          topic:       record.topic || record.chapterTitle,
          cards:       cards.slice(0, 30),
          createdAt:   Date.now(),
        };
        await saveRecallSet(set);
        setRecallSaved(true);
        onRecallSaved?.(set.id);
        console.log("[STUDYGUIDE_AUTO_SAVED_TO_RECALLLAB]", { guideId: record.id, cards: set.cards.length });
      } catch (e) {
        setSaveError(`RecallLab auto-save failed: ${String(e)}`);
      }

      // ── Dispatch podcast script ───────────────────────────────────────
      onPodcastScript?.(buildPodcastScriptFromGuide(record, currentPage ?? 0, bookId));

    } catch (e) {
      setError(`Generation failed: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Save to NoteLab ────────────────────────────────────────────────────

  const handleSaveToNoteLab = async () => {
    if (!currentGuide) return;
    setSaveError(null);
    try {
      const concepts = currentGuide.mustKnow.slice(0, 3).map((text, i) => ({
        ordinal:        i + 1,
        title:          `Must Know ${i + 1}`,
        pattern:        text,
        surgicalReason: currentGuide.datFacts[i] ?? "",
        trap:           currentGuide.traps[i] ?? "",
        rule:           currentGuide.memoryHooks[i] ?? "",
      }));

      const note = buildUltraNote(
        bookId,
        currentPage ?? 0,
        currentGuide.topic || currentGuide.chapterTitle,
        currentGuide.mustKnow[0] ?? "See study guide",
        concepts,
        bookTitle,
        undefined,
        currentGuide.mustKnow[0] ?? undefined,
        currentGuide.recallQuestions.slice(0, 4),
      );
      await saveUltraNote(note);
      setNoteSaved(true);
      console.log("[STUDYGUIDE_SAVED_TO_NOTELAB]", { guideId: currentGuide.id, noteId: note.id });
    } catch (e) {
      setSaveError(`NoteLab save failed: ${String(e)}`);
    }
  };

  // ── Save to RecallLab ──────────────────────────────────────────────────

  const handleSaveToRecallLab = async () => {
    if (!currentGuide) return;
    setSaveError(null);
    try {
      const cards: RecallCard[] = [
        ...currentGuide.recallQuestions.map((q, i): RecallCard => ({
          id: `sgrc-q${i}`,
          type: "dat-question",
          front: q,
          back: currentGuide.mustKnow[i] ?? currentGuide.datFacts[i] ?? "See study guide",
          reviewCount: 0,
          isMissed: false,
          difficulty: "medium",
        })),
        ...currentGuide.datFacts.map((f, i): RecallCard => ({
          id: `sgrc-f${i}`,
          type: "fact",
          front: `DAT Fact: ${f.split("→")[0]?.trim() ?? f}`,
          back: f,
          reviewCount: 0,
          isMissed: false,
          difficulty: "hard",
        })),
        ...currentGuide.traps.map((t, i): RecallCard => ({
          id: `sgrc-t${i}`,
          type: "concept",
          front: `⚠️ Common trap: ${t}`,
          back: `Avoid confusing: ${t}`,
          reviewCount: 0,
          isMissed: false,
          difficulty: "hard",
        })),
      ];

      const set: RecallSet = {
        id: stableRecallId(bookId, currentPage ?? 0, "sg"),
        bookId,
        bookTitle:   bookTitle ?? undefined,
        sourceLabel: "study-guide",
        pageNumber:  currentPage ?? 0,
        subject:     "Biology",
        topic:       currentGuide.topic || currentGuide.chapterTitle,
        cards:       cards.slice(0, 30),
        createdAt:   Date.now(),
      };

      await saveRecallSet(set);
      setRecallSaved(true);
      console.log("[STUDYGUIDE_SAVED_TO_RECALLLAB]", { guideId: currentGuide.id, cards: set.cards.length });
    } catch (e) {
      setSaveError(`RecallLab save failed: ${String(e)}`);
    }
  };

  // ── Export Markdown ────────────────────────────────────────────────────

  const handleExportMarkdown = () => {
    if (!currentGuide) return;
    const md = exportToMarkdown(currentGuide);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentGuide.topic || "study-guide"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ─────────────────────────────────────────────────────────────

  const hasSources = sources.some(s => s.text.trim().length > 0);

  return (
    <div className="h-full flex flex-col bg-slate-950 text-white overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-slate-800 px-5 py-3.5 flex items-center justify-between bg-gradient-to-r from-slate-950 to-slate-900">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-teal-400">Study Guide Lab</div>
          <div className="text-xs text-slate-500 mt-0.5">Build notes a top student would actually keep.</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setHistoryTab("build")}
            className={`text-xs px-3 py-1 rounded-lg transition-colors ${historyTab === "build" ? "bg-teal-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}
          >
            Build
          </button>
          <button
            onClick={() => setHistoryTab("history")}
            className={`text-xs px-3 py-1 rounded-lg transition-colors ${historyTab === "history" ? "bg-teal-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}
          >
            History ({history.length})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {historyTab === "history" ? (
          /* ── History panel ── */
          <div className="p-4 flex flex-col gap-3">
            {history.length === 0 ? (
              <div className="text-sm text-slate-500 text-center py-8">No study guides generated yet.</div>
            ) : (
              history.map(g => (
                <div
                  key={g.id}
                  className="rounded-xl border border-slate-700 bg-slate-900 p-4 hover:border-teal-700/50 transition-colors cursor-pointer group"
                  onClick={() => { setCurrentGuide(g); setHistoryTab("build"); }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">{g.topic || g.chapterTitle}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{g.chapterTitle}</div>
                      <div className="flex gap-2 mt-1.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-900/60 text-teal-300">
                          {STUDY_GUIDE_MODE_LABELS[g.mode]}
                        </span>
                        <span className="text-[10px] text-slate-600">
                          {new Date(g.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteStudyGuide(g.id).then(() =>
                          setHistory(prev => prev.filter(x => x.id !== g.id))
                        );
                      }}
                      className="text-slate-700 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    {g.mustKnow.length} concepts · {g.datFacts.length} DAT facts · {g.recallQuestions.length} questions
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-0">
            {/* ── Live Reader context banner ── */}
            {studyModel && (
              <div className="border-b border-teal-900/60 bg-teal-950/30 px-4 py-3 flex items-start gap-3">
                <div className="text-teal-400 text-base flex-shrink-0">📖</div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-teal-300 uppercase tracking-wider">Live Reader Context — Page {currentPage ?? studyModel.page}</div>
                  <div className="text-xs text-teal-200/80 mt-0.5 leading-snug truncate">{studyModel.pageThesis}</div>
                  {studyModel.conceptBlocks?.length > 0 && (
                    <div className="text-[10px] text-teal-400/60 mt-1">
                      {studyModel.conceptBlocks.length} concept block{studyModel.conceptBlocks.length !== 1 ? "s" : ""} · {studyModel.visualAnchors?.length ?? 0} high-yield anchors
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* ── Sources panel — collapsible, collapsed by default when live model present ── */}
            <CollapsiblePanel
              title={studyModel ? "Additional Sources (optional)" : "Source Documents"}
              subtitle={hasSources ? `${sources.filter(s => s.text.trim().length > 0).length} source(s) added` : undefined}
              defaultOpen={!studyModel}
            >
              {studyModel ? (
                /* When live model is present, only show slots 2-4 (blueprint/professor/personal) */
                sources.filter(s => s.id !== "textbook").map(slot => (
                  <UploadZone
                    key={slot.id}
                    slot={slot}
                    onTextChange={handleTextChange}
                    onFileLoad={handleFileLoad}
                  />
                ))
              ) : (
                sources.map(slot => (
                  <UploadZone
                    key={slot.id}
                    slot={slot}
                    onTextChange={handleTextChange}
                    onFileLoad={handleFileLoad}
                  />
                ))
              )}
            </CollapsiblePanel>

            {/* ── Config panel — collapsible, collapsed by default ── */}
            <CollapsiblePanel
              title="Configuration"
              subtitle={`${STUDY_GUIDE_MODE_LABELS[mode]}${examGoal ? ` · ${EXAM_GOAL_LABELS[examGoal]}${targetScore ? ` (${targetScore})` : ""}` : ""}`}
              defaultOpen={false}
            >
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-1">Chapter / Unit</label>
                  <input
                    type="text"
                    value={chapterTitle}
                    onChange={(e) => setChapterTitle(e.target.value)}
                    placeholder="e.g. Chapter 2: The Chemical Context of Life"
                    className="w-full rounded-lg bg-slate-800 border border-slate-600 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 text-sm text-slate-200 px-3 py-2 outline-none transition-colors"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-1">Topic</label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Matter, Elements, and Compounds"
                    className="w-full rounded-lg bg-slate-800 border border-slate-600 focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 text-sm text-slate-200 px-3 py-2 outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Mode selector */}
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-2">Build Mode</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(Object.keys(STUDY_GUIDE_MODE_LABELS) as StudyGuideMode[]).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`text-left rounded-xl border px-3 py-2 transition-all ${
                        mode === m
                          ? "border-teal-500 bg-teal-950/40 text-teal-200"
                          : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                      }`}
                    >
                      <div className="text-xs font-semibold">{STUDY_GUIDE_MODE_LABELS[m]}</div>
                      <div className="text-[10px] mt-0.5 opacity-70 leading-tight">{STUDY_GUIDE_MODE_DESCRIPTIONS[m].slice(0, 55)}…</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Study Goal selector */}
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-2">Study Goal (optional)</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(Object.keys(EXAM_GOAL_LABELS) as ExamGoal[]).map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setExamGoal(prev => prev === g ? null : g)}
                      className={`text-xs font-semibold rounded-lg border px-3 py-1.5 transition-all ${
                        examGoal === g
                          ? "border-teal-500 bg-teal-950/40 text-teal-200"
                          : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                      }`}
                    >
                      {EXAM_GOAL_LABELS[g]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target score — DAT only */}
              {examGoal === "dat" && (
                <div>
                  <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-2">Target Score</label>
                  <div className="flex gap-2">
                    {DAT_TARGET_SCORES.map(score => (
                      <button
                        key={score}
                        type="button"
                        onClick={() => setTargetScore(prev => prev === score ? null : score)}
                        className={`text-xs font-semibold rounded-lg border px-3 py-1.5 transition-all ${
                          targetScore === score
                            ? "border-teal-500 bg-teal-950/40 text-teal-200"
                            : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                        }`}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CollapsiblePanel>

            {/* ── Generate button — always visible ── */}
            <div className="border-b border-slate-800 p-4 flex flex-col gap-3">
              {error && (
                <div className="text-xs text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              {provider === "fallback" && !error && (
                <div className="text-xs text-orange-400 bg-orange-950/30 border border-orange-800/40 rounded-lg px-3 py-2">
                  ⚠ AI unavailable — showing fallback output
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={loading || (!hasSources && !studyModel)}
                className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors shadow-lg shadow-teal-900/30"
              >
                {loading
                  ? "Building Study Guide…"
                  : studyModel
                    ? `📖 Build ${STUDY_GUIDE_MODE_LABELS[mode]} — Page ${currentPage ?? studyModel.page}`
                    : `🎓 Build ${STUDY_GUIDE_MODE_LABELS[mode]}`}
              </button>
            </div>

            {/* ── Output panel ── */}
            {currentGuide && (
              <div className="p-4 flex flex-col gap-4">
                {/* Title */}
                <div className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide">{STUDY_GUIDE_MODE_LABELS[currentGuide.mode]}</div>
                    {currentGuide.priority && (
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                        currentGuide.priority === "High"
                          ? "border-red-500/40 bg-red-950/40 text-red-300"
                          : currentGuide.priority === "Medium"
                            ? "border-yellow-500/40 bg-yellow-950/40 text-yellow-300"
                            : "border-slate-600 bg-slate-800 text-slate-400"
                      }`}>
                        {currentGuide.priority} Priority
                      </span>
                    )}
                  </div>
                  <div className="text-base font-bold text-white mt-0.5">{currentGuide.chapterTitle}</div>
                  <div className="text-sm text-teal-300">{currentGuide.topic}</div>
                  {currentGuide.examGoal && (
                    <div className="text-[10px] text-slate-500 mt-1">
                      🎯 {EXAM_GOAL_LABELS[currentGuide.examGoal]}{currentGuide.targetScore ? ` · Target ${currentGuide.targetScore}` : ""}
                    </div>
                  )}
                  {provider && (
                    <div className={`text-[10px] mt-1.5 ${provider === "fallback" ? "text-orange-400" : "text-slate-600"}`}>
                      {provider === "fallback" ? "⚠ AI fallback" : `✓ ${provider}`}
                    </div>
                  )}
                </div>

                {/* Must Know */}
                {currentGuide.mustKnow.length > 0 && (
                  <Section title="Must Know" color="yellow">
                    <ul className="flex flex-col gap-2">
                      {currentGuide.mustKnow.map((item, i) => (
                        <li key={i} className="flex gap-2 text-sm text-slate-200">
                          <span className="text-yellow-400 flex-shrink-0 mt-0.5">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {/* DAT High-Yield Facts */}
                {currentGuide.datFacts.length > 0 && (
                  <Section title="DAT High-Yield Facts" color="orange">
                    <div className="flex flex-col gap-2">
                      {currentGuide.datFacts.map((fact, i) => (
                        <div key={i} className="flex gap-2 text-sm">
                          <span className="text-orange-400 flex-shrink-0">⭐</span>
                          <span className="text-orange-100 font-medium">{fact}</span>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Mechanism Maps */}
                {currentGuide.mechanisms.length > 0 && (
                  <Section title="Mechanism Maps" color="green">
                    {currentGuide.mechanisms.map((m, i) => (
                      <MechanismMap key={i} title={m.title} steps={m.steps} />
                    ))}
                  </Section>
                )}

                {/* Common Traps */}
                {currentGuide.traps.length > 0 && (
                  <Section title="Common DAT Traps" color="red">
                    <div className="flex flex-col gap-2">
                      {currentGuide.traps.map((trap, i) => (
                        <div key={i} className="flex gap-2 text-sm items-baseline">
                          <span className="text-red-400 flex-shrink-0">⚠</span>
                          <span className="text-red-200">{trap}</span>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Recall Questions */}
                {currentGuide.recallQuestions.length > 0 && (
                  <Section title="Recall Questions" color="blue">
                    <ol className="flex flex-col gap-2 list-decimal list-inside">
                      {currentGuide.recallQuestions.map((q, i) => (
                        <li key={i} className="text-sm text-blue-100">{q}</li>
                      ))}
                    </ol>
                  </Section>
                )}

                {/* Memory Hooks */}
                {currentGuide.memoryHooks.length > 0 && (
                  <Section title="Memory Hooks" color="purple">
                    <div className="flex flex-col gap-3">
                      {currentGuide.memoryHooks.map((hook, i) => (
                        <div key={i} className="text-sm text-purple-200 bg-purple-950/40 border border-purple-800/40 rounded-lg px-3 py-2 italic">
                          {hook}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Daily Study Tasks */}
                {currentGuide.dailyTasks?.length > 0 && (
                  <Section title="Daily Study Tasks" color="green">
                    <ul className="flex flex-col gap-2">
                      {currentGuide.dailyTasks.map((task, i) => (
                        <li key={i} className="flex gap-2 text-sm text-slate-200">
                          <span className="text-green-400 flex-shrink-0 mt-0.5">☐</span>
                          <span>{task}</span>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {/* Action buttons */}
                <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
                  {saveError && (
                    <div className="text-xs text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg px-3 py-2">
                      {saveError}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setNoteSaved(false); handleSaveToNoteLab(); }}
                      disabled={noteSaved}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
                        noteSaved
                          ? "bg-green-900/40 border border-green-700/40 text-green-400 cursor-default"
                          : "bg-green-950/40 border border-green-700/30 text-green-300 hover:bg-green-900/50"
                      }`}
                    >
                      {noteSaved ? "✓ Auto-saved to NoteLab" : "📝 Re-save to NoteLab"}
                    </button>
                    <button
                      onClick={() => { setRecallSaved(false); handleSaveToRecallLab(); }}
                      disabled={recallSaved}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
                        recallSaved
                          ? "bg-indigo-900/40 border border-indigo-700/40 text-indigo-400 cursor-default"
                          : "bg-indigo-950/40 border border-indigo-700/30 text-indigo-300 hover:bg-indigo-900/50"
                      }`}
                    >
                      {recallSaved ? "✓ Auto-saved to Recall Lab" : "🎯 Re-save to Recall Lab"}
                    </button>
                    <button
                      onClick={handleExportMarkdown}
                      className="flex-1 py-2 rounded-lg text-xs font-bold bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors"
                    >
                      ⬇ Export .md
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
