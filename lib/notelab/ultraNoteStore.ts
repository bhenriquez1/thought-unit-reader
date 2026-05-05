// lib/notelab/ultraNoteStore.ts
// localStorage-backed store for Ultra Notes generated from the right panel.

export type NoteSubject = "Biology" | "Calculus" | "Dental / Clinical" | "General Notes";

export interface UltraNoteFolder {
  id: string;
  name: string;
  sourceBookId: string;
  subject: NoteSubject;
  createdAt: number;
}

/** Infer subject from bookId or title keywords */
export function inferSubject(bookId: string): NoteSubject {
  const lower = bookId.toLowerCase();
  if (/bio(logy)?|anatomy|physiology|genetics|cell|organism/.test(lower)) return "Biology";
  if (/calc|math|algebra|geometry|trig|statistic|linear|differential/.test(lower)) return "Calculus";
  if (/dental|dent|medical|med|clinical|nursing|pharma|patho|histology/.test(lower)) return "Dental / Clinical";
  return "General Notes";
}

export interface UltraNoteConcept {
  ordinal: number;
  title: string;
  pattern: string;
  surgicalReason: string;
  trap: string;
  rule: string;
}

export interface UltraNote {
  id: string;
  bookId: string;
  pageNumber: number;
  topic: string;
  coreIdea: string;
  concepts: UltraNoteConcept[];
  memoryShortcuts: string[];
  subject: NoteSubject;
  createdAt: number;
}

const STORAGE_KEY = "ultraNotes_v1";

function loadAll(): UltraNote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(notes: UltraNote[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // localStorage full — silently skip
  }
}

export function getAllUltraNotes(): UltraNote[] {
  return loadAll();
}

export function getNotesByBook(bookId: string): UltraNote[] {
  return loadAll().filter((n) => n.bookId === bookId);
}

export function saveUltraNote(note: UltraNote): void {
  const notes = loadAll();
  // Replace if same book + page already has a note
  const idx = notes.findIndex((n) => n.bookId === note.bookId && n.pageNumber === note.pageNumber);
  if (idx >= 0) {
    notes[idx] = note;
  } else {
    notes.unshift(note);
  }
  // Keep latest 200 notes
  saveAll(notes.slice(0, 200));
}

export function deleteUltraNote(id: string): void {
  saveAll(loadAll().filter((n) => n.id !== id));
}

export function buildUltraNote(
  bookId: string,
  pageNumber: number,
  topic: string,
  coreIdea: string,
  concepts: UltraNoteConcept[]
): UltraNote {
  const memoryShortcuts = concepts
    .filter((c) => c.rule && c.rule.length > 10)
    .map((c) => `${c.title}: ${c.rule}`)
    .slice(0, 3);

  return {
    id: `note-${bookId}-p${pageNumber}-${Date.now()}`,
    bookId,
    pageNumber,
    topic,
    coreIdea,
    concepts,
    memoryShortcuts,
    subject: inferSubject(bookId),
    createdAt: Date.now(),
  };
}

export function formatUltraNoteText(note: UltraNote): string {
  const lines: string[] = [
    `⚡ ULTRA NOTE — ${note.topic} (Page ${note.pageNumber})`,
    ``,
    `🧠 CORE IDEA`,
    note.coreIdea,
    ``,
  ];

  note.concepts.forEach((c) => {
    lines.push(`🧩 ${c.ordinal}️⃣ ${c.title}`);
    if (c.pattern) lines.push(`P — Pattern\n  ${c.pattern}`);
    if (c.surgicalReason) lines.push(`⚡ Surgical Reason\n  ${c.surgicalReason}`);
    if (c.trap) lines.push(`❗ Trap\n  ${c.trap}`);
    if (c.rule) lines.push(`🔥 Rule\n  ${c.rule}`);
    lines.push(``);
  });

  if (note.memoryShortcuts.length > 0) {
    lines.push(`🧠 MEMORY SHORTCUT`);
    note.memoryShortcuts.forEach((s) => lines.push(`👉 ${s}`));
  }

  return lines.join("\n");
}
