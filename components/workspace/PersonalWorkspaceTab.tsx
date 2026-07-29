"use client";

// components/workspace/PersonalWorkspaceTab.tsx
// The student's personal digital notebook — 100% user-authored content.
// Replaces the AI-output "Notes" sub-tab with a real workspace the student owns.

import React, { useState, useRef, useCallback } from "react";
import { useWorkspaceStore } from "@/lib/workspace/workspaceStore";
import { WORKSPACE_SECTIONS } from "@/lib/workspace/workspaceTypes";
import type {
  WorkspaceItemType,
  WorkspaceItem,
  NoteItem,
  FavoriteItem,
  PinItem,
  MnemonicItem,
  QuestionItem,
  TaskItem,
  HighlightItem,
} from "@/lib/workspace/workspaceTypes";

// ── Props ─────────────────────────────────────────────────────────────────────

interface PersonalWorkspaceTabProps {
  bookId: string;
  currentPage?: number;
  /** When set, pre-populates a new Pin with this quote from the reader */
  prefillPinQuote?: string | null;
  onNavigateToPage?: (page: number) => void;
  onPromoteToStudyGuide?: (text: string) => void;
}

// ── Color chips ───────────────────────────────────────────────────────────────

const HIGHLIGHT_COLORS: HighlightItem["color"][] = ["yellow", "green", "blue", "pink", "orange"];
const COLOR_CLASS: Record<HighlightItem["color"], string> = {
  yellow: "bg-yellow-400/20 border-yellow-400/40 text-yellow-200",
  green:  "bg-emerald-400/20 border-emerald-400/40 text-emerald-200",
  blue:   "bg-sky-400/20 border-sky-400/40 text-sky-200",
  pink:   "bg-pink-400/20 border-pink-400/40 text-pink-200",
  orange: "bg-orange-400/20 border-orange-400/40 text-orange-200",
};
const COLOR_DOT: Record<HighlightItem["color"], string> = {
  yellow: "bg-yellow-400",
  green:  "bg-emerald-400",
  blue:   "bg-sky-400",
  pink:   "bg-pink-400",
  orange: "bg-orange-400",
};

// ── Shared card wrapper ───────────────────────────────────────────────────────

function Card({
  children,
  onDelete,
  onNavigate,
}: {
  children: React.ReactNode;
  onDelete: () => void;
  onNavigate?: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="group relative rounded-lg border border-white/8 bg-white/4 px-3 py-2.5 transition-colors hover:bg-white/6"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
      {hover && (
        <div className="absolute right-2 top-2 flex gap-1">
          {onNavigate && (
            <button
              onClick={onNavigate}
              className="rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-white/10 hover:text-slate-200"
            >
              ↗ Page
            </button>
          )}
          <button
            onClick={onDelete}
            className="rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-red-900/30 hover:text-red-400"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptySection({ text }: { text: string }) {
  return (
    <div className="py-6 text-center text-[12px] text-slate-500 italic">{text}</div>
  );
}

// ── Section renderers ─────────────────────────────────────────────────────────

function NotesList({
  items, bookId, onNavigate,
}: { items: NoteItem[]; bookId: string; onNavigate?: (p: number) => void }) {
  const store = useWorkspaceStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (items.length === 0) return <EmptySection text="No personal notes yet. Start writing." />;
  return (
    <div className="flex flex-col gap-2">
      {items.map(item => (
        <Card
          key={item.id}
          onDelete={() => store.deleteItem(bookId, item.id)}
          onNavigate={item.pageRef ? () => onNavigate?.(item.pageRef!) : undefined}
        >
          <div className="text-[12px] font-semibold text-white/80 mb-0.5">{item.title}</div>
          {editing === item.id ? (
            <div className="flex flex-col gap-1.5 mt-1">
              <textarea
                className="w-full rounded bg-white/6 border border-white/10 px-2 py-1.5 text-[12px] text-slate-200 resize-none outline-none focus:border-white/20"
                rows={4}
                value={draft}
                onChange={e => setDraft(e.target.value)}
              />
              <div className="flex gap-1.5">
                <button
                  className="rounded bg-emerald-700/40 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-700/60"
                  onClick={() => { store.updateItem(bookId, item.id, { content: draft } as Partial<NoteItem>); setEditing(null); }}
                >Save</button>
                <button
                  className="rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-white/8"
                  onClick={() => setEditing(null)}
                >Cancel</button>
              </div>
            </div>
          ) : (
            <div
              className="text-[12px] text-slate-400 whitespace-pre-wrap cursor-pointer hover:text-slate-300"
              onClick={() => { setEditing(item.id); setDraft(item.content); }}
            >
              {item.content || <span className="italic opacity-50">empty note — click to edit</span>}
            </div>
          )}
          {item.pageRef && <div className="mt-1 text-[10px] text-slate-600">p. {item.pageRef}</div>}
        </Card>
      ))}
    </div>
  );
}

function FavoritesList({
  items, bookId, onNavigate,
}: { items: FavoriteItem[]; bookId: string; onNavigate?: (p: number) => void }) {
  const store = useWorkspaceStore();
  if (items.length === 0) return <EmptySection text="Star concepts to save them here." />;
  return (
    <div className="flex flex-col gap-2">
      {items.map(item => (
        <Card
          key={item.id}
          onDelete={() => store.deleteItem(bookId, item.id)}
          onNavigate={item.pageRef ? () => onNavigate?.(item.pageRef!) : undefined}
        >
          <div className="flex items-start gap-1.5">
            <span className="text-yellow-400 text-[14px] mt-0.5">⭐</span>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold text-white/80">{item.conceptTitle}</div>
              {item.excerpt && <div className="text-[11px] text-slate-500 mt-0.5 truncate">{item.excerpt}</div>}
              {item.canonicalType && (
                <div className="mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] bg-white/6 text-slate-500 uppercase tracking-wider">
                  {item.canonicalType}
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function PinsList({
  items, bookId, onNavigate,
}: { items: PinItem[]; bookId: string; onNavigate?: (p: number) => void }) {
  const store = useWorkspaceStore();
  if (items.length === 0) return <EmptySection text="Pin textbook passages to revisit them." />;
  return (
    <div className="flex flex-col gap-2">
      {items.map(item => (
        <Card
          key={item.id}
          onDelete={() => store.deleteItem(bookId, item.id)}
          onNavigate={item.pageRef ? () => onNavigate?.(item.pageRef!) : undefined}
        >
          <div className="flex items-start gap-1.5">
            <span className="text-sky-400 text-[14px] mt-0.5">📌</span>
            <div className="flex-1 min-w-0">
              {item.chapter && <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{item.chapter}</div>}
              <blockquote className="border-l-2 border-sky-600/50 pl-2 text-[12px] text-slate-300 italic leading-relaxed">
                {item.quote}
              </blockquote>
              {item.note && <div className="mt-1 text-[11px] text-slate-400">{item.note}</div>}
              {item.pageRef && <div className="mt-1 text-[10px] text-slate-600">p. {item.pageRef}</div>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function MnemonicsList({
  items, bookId,
}: { items: MnemonicItem[]; bookId: string }) {
  const store = useWorkspaceStore();
  if (items.length === 0) return <EmptySection text="Add your own memory devices here." />;
  return (
    <div className="flex flex-col gap-2">
      {items.map(item => (
        <Card key={item.id} onDelete={() => store.deleteItem(bookId, item.id)}>
          <div className="flex items-start gap-1.5">
            <span className="text-purple-400 text-[14px] mt-0.5">🧠</span>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-0.5">{item.conceptTitle}</div>
              <div className="text-[13px] font-medium text-purple-200">{item.mnemonic}</div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function QuestionsList({
  items, bookId,
}: { items: QuestionItem[]; bookId: string }) {
  const store = useWorkspaceStore();
  if (items.length === 0) return <EmptySection text="Capture questions for later or for your instructor." />;
  return (
    <div className="flex flex-col gap-2">
      {items.map(item => (
        <Card key={item.id} onDelete={() => store.deleteItem(bookId, item.id)}>
          <div className="flex items-start gap-2">
            <button
              onClick={() => store.toggleQuestionAnswered(bookId, item.id)}
              className={`mt-0.5 flex-shrink-0 text-[13px] transition-colors ${item.answered ? "text-emerald-400" : "text-slate-500 hover:text-emerald-400"}`}
            >
              {item.answered ? "✅" : "❓"}
            </button>
            <div className="flex-1 min-w-0">
              <div className={`text-[12px] leading-relaxed ${item.answered ? "line-through text-slate-500" : "text-slate-200"}`}>
                {item.question}
              </div>
              {item.answer && (
                <div className="mt-1 text-[11px] text-emerald-400 border-l-2 border-emerald-700 pl-2">
                  {item.answer}
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function TasksList({
  items, bookId,
}: { items: TaskItem[]; bookId: string }) {
  const store = useWorkspaceStore();
  if (items.length === 0) return <EmptySection text="Track what you need to review or do." />;
  return (
    <div className="flex flex-col gap-1.5">
      {items.map(item => (
        <div
          key={item.id}
          className="group flex items-center gap-2 rounded-md px-2.5 py-2 hover:bg-white/4"
        >
          <button
            onClick={() => store.toggleTaskComplete(bookId, item.id)}
            className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
              item.completed
                ? "bg-emerald-600 border-emerald-600 text-white"
                : "border-white/20 hover:border-emerald-500"
            }`}
          >
            {item.completed && <span className="text-[10px]">✓</span>}
          </button>
          <span className={`flex-1 text-[12px] ${item.completed ? "line-through text-slate-500" : "text-slate-200"}`}>
            {item.text}
          </span>
          <button
            onClick={() => store.deleteItem(bookId, item.id)}
            className="opacity-0 group-hover:opacity-100 text-[10px] text-slate-600 hover:text-red-400"
          >✕</button>
        </div>
      ))}
    </div>
  );
}

function HighlightsList({
  items, bookId, onNavigate,
}: { items: HighlightItem[]; bookId: string; onNavigate?: (p: number) => void }) {
  const store = useWorkspaceStore();
  if (items.length === 0) return <EmptySection text="Your personal highlights appear here." />;
  return (
    <div className="flex flex-col gap-2">
      {items.map(item => (
        <Card
          key={item.id}
          onDelete={() => store.deleteItem(bookId, item.id)}
          onNavigate={item.pageRef ? () => onNavigate?.(item.pageRef!) : undefined}
        >
          <div className={`rounded px-2.5 py-2 border text-[12px] leading-relaxed ${COLOR_CLASS[item.color]}`}>
            <div className={`inline-block w-2 h-2 rounded-full ${COLOR_DOT[item.color]} mr-1.5 align-middle`} />
            {item.quote}
          </div>
          {item.note && <div className="mt-1.5 text-[11px] text-slate-400">{item.note}</div>}
          {item.pageRef && <div className="mt-1 text-[10px] text-slate-600">p. {item.pageRef}</div>}
        </Card>
      ))}
    </div>
  );
}

// ── Add-item forms ────────────────────────────────────────────────────────────

function AddForm({
  type, bookId, currentPage, prefillQuote, onClose,
}: {
  type: WorkspaceItemType;
  bookId: string;
  currentPage?: number;
  prefillQuote?: string | null;
  onClose: () => void;
}) {
  const store = useWorkspaceStore();
  const [title, setTitle]     = useState("");
  const [content, setContent] = useState("");
  const [quote, setQuote]     = useState(prefillQuote ?? "");
  const [mnemonic, setMnemonic] = useState("");
  const [color, setColor]     = useState<HighlightItem["color"]>("yellow");
  const titleRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(() => {
    const p = currentPage;
    switch (type) {
      case "note":
        if (!title.trim() && !content.trim()) return;
        store.addNote(bookId, title || "Untitled", content, p);
        break;
      case "favorite":
        if (!title.trim()) return;
        store.addFavorite(bookId, title, content || undefined, undefined, p);
        break;
      case "pin":
        if (!quote.trim()) return;
        store.addPin(bookId, quote, p ?? 1, undefined, content || undefined);
        break;
      case "mnemonic":
        if (!title.trim() || !mnemonic.trim()) return;
        store.addMnemonic(bookId, title, mnemonic, p);
        break;
      case "question":
        if (!content.trim()) return;
        store.addQuestion(bookId, content, p);
        break;
      case "task":
        if (!content.trim()) return;
        store.addTask(bookId, content, p);
        break;
      case "highlight":
        if (!quote.trim()) return;
        store.addHighlight(bookId, quote, color, p ?? 1, content || undefined);
        break;
    }
    onClose();
  }, [type, bookId, title, content, quote, mnemonic, color, currentPage, store, onClose]);

  return (
    <div className="rounded-lg border border-white/12 bg-[rgb(18,26,46)] p-3 flex flex-col gap-2">
      {(type === "note" || type === "favorite" || type === "mnemonic") && (
        <input
          ref={titleRef}
          autoFocus
          placeholder={type === "note" ? "Note title…" : type === "favorite" ? "Concept name…" : "Concept being memorized…"}
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full rounded bg-white/6 border border-white/10 px-2.5 py-1.5 text-[12px] text-slate-200 outline-none focus:border-white/20 placeholder:text-slate-600"
        />
      )}
      {type === "mnemonic" ? (
        <input
          autoFocus={!title}
          placeholder="Your mnemonic / memory device…"
          value={mnemonic}
          onChange={e => setMnemonic(e.target.value)}
          className="w-full rounded bg-white/6 border border-white/10 px-2.5 py-1.5 text-[12px] text-slate-200 outline-none focus:border-white/20 placeholder:text-slate-600"
        />
      ) : (type === "pin" || type === "highlight") ? (
        <textarea
          autoFocus
          placeholder="Paste the textbook passage…"
          value={quote}
          onChange={e => setQuote(e.target.value)}
          rows={3}
          className="w-full rounded bg-white/6 border border-white/10 px-2.5 py-1.5 text-[12px] text-slate-200 outline-none focus:border-white/20 placeholder:text-slate-600 resize-none"
        />
      ) : (
        <textarea
          autoFocus={type !== "note"}
          placeholder={
            type === "note"      ? "Write anything…" :
            type === "question"  ? "What's your question?" :
            type === "task"      ? "What do you need to do?" :
            type === "favorite"  ? "Short excerpt (optional)…" : ""
          }
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={type === "note" ? 4 : 2}
          className="w-full rounded bg-white/6 border border-white/10 px-2.5 py-1.5 text-[12px] text-slate-200 outline-none focus:border-white/20 placeholder:text-slate-600 resize-none"
        />
      )}
      {(type === "pin" || type === "highlight") && (
        <input
          placeholder="Personal note (optional)…"
          value={content}
          onChange={e => setContent(e.target.value)}
          className="w-full rounded bg-white/6 border border-white/10 px-2.5 py-1.5 text-[12px] text-slate-200 outline-none focus:border-white/20 placeholder:text-slate-600"
        />
      )}
      {type === "highlight" && (
        <div className="flex gap-1.5 items-center">
          <span className="text-[10px] text-slate-500">Color:</span>
          {HIGHLIGHT_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-5 h-5 rounded-full ${COLOR_DOT[c]} transition-transform ${color === c ? "scale-125 ring-2 ring-white/40" : "opacity-60 hover:opacity-100"}`}
            />
          ))}
        </div>
      )}
      <div className="flex gap-1.5 justify-end">
        <button
          onClick={onClose}
          className="rounded px-2.5 py-1 text-[11px] text-slate-400 hover:bg-white/8"
        >Cancel</button>
        <button
          onClick={submit}
          className="rounded bg-emerald-700/40 px-3 py-1 text-[11px] text-emerald-300 hover:bg-emerald-700/60 font-medium"
        >Save</button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PersonalWorkspaceTab({
  bookId,
  currentPage,
  prefillPinQuote,
  onNavigateToPage,
}: PersonalWorkspaceTabProps) {
  const store = useWorkspaceStore();
  const [activeSection, setActiveSection] = useState<WorkspaceItemType>("note");
  const [showAddForm, setShowAddForm] = useState(false);

  const items = store.getItemsByType(bookId, activeSection);
  const totalCount = store.getItems(bookId).length;

  const sectionConfig = WORKSPACE_SECTIONS.find(s => s.type === activeSection)!;

  function renderItems() {
    switch (activeSection) {
      case "note":      return <NotesList      items={items as NoteItem[]}      bookId={bookId} onNavigate={onNavigateToPage} />;
      case "favorite":  return <FavoritesList  items={items as FavoriteItem[]}  bookId={bookId} onNavigate={onNavigateToPage} />;
      case "pin":       return <PinsList       items={items as PinItem[]}       bookId={bookId} onNavigate={onNavigateToPage} />;
      case "mnemonic":  return <MnemonicsList  items={items as MnemonicItem[]}  bookId={bookId} />;
      case "question":  return <QuestionsList  items={items as QuestionItem[]}  bookId={bookId} />;
      case "task":      return <TasksList      items={items as TaskItem[]}      bookId={bookId} />;
      case "highlight": return <HighlightsList items={items as HighlightItem[]} bookId={bookId} onNavigate={onNavigateToPage} />;
      default:          return null;
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[rgb(11,18,34)]">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-3 pb-2 border-b border-white/8">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">Personal Workspace</div>
            {totalCount > 0 && (
              <div className="text-[10px] text-slate-600 mt-0.5">{totalCount} item{totalCount !== 1 ? "s" : ""} saved</div>
            )}
          </div>
          {currentPage && (
            <div className="text-[10px] text-slate-600">Page {currentPage}</div>
          )}
        </div>

        {/* Section tabs — scrollable row */}
        <div className="flex gap-1 overflow-x-auto pb-0.5 hide-scrollbar">
          {WORKSPACE_SECTIONS.map(sec => {
            const count = store.getItemsByType(bookId, sec.type).length;
            return (
              <button
                key={sec.type}
                onClick={() => { setActiveSection(sec.type); setShowAddForm(false); }}
                className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                  activeSection === sec.type
                    ? "bg-emerald-600/20 text-emerald-300 border border-emerald-600/30"
                    : "text-slate-500 hover:bg-white/8 hover:text-slate-300"
                }`}
              >
                <span>{sec.icon}</span>
                <span>{sec.label}</span>
                {count > 0 && (
                  <span className={`rounded-full px-1 text-[9px] font-bold ${activeSection === sec.type ? "bg-emerald-700/50 text-emerald-300" : "bg-white/8 text-slate-500"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        {/* Add button */}
        {!showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full rounded-lg border border-dashed border-white/12 py-2 text-[12px] text-slate-500 hover:border-white/20 hover:text-slate-300 hover:bg-white/4 transition-colors flex items-center justify-center gap-1.5"
          >
            <span className="text-[14px]">{sectionConfig.icon}</span>
            <span>Add {sectionConfig.label.replace(/s$/, "")}…</span>
          </button>
        ) : (
          <AddForm
            type={activeSection}
            bookId={bookId}
            currentPage={currentPage}
            prefillQuote={prefillPinQuote}
            onClose={() => setShowAddForm(false)}
          />
        )}

        {/* Items */}
        {renderItems()}
      </div>

      {/* Footer hint */}
      {totalCount === 0 && (
        <div className="flex-shrink-0 px-4 py-3 border-t border-white/6">
          <p className="text-[11px] text-slate-600 text-center leading-relaxed">
            Your personal notebook. Everything here is yours — notes, pins, mnemonics, questions, and tasks.
            Nothing is AI-generated.
          </p>
        </div>
      )}
    </div>
  );
}
