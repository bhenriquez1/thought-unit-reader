// lib/notelab/exportNote.ts
// Export UltraNotes to Markdown / PDF — local download, no cloud/OAuth dependency.

import type { UltraNote } from "./ultraNoteStore";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "note";
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const SECTION_HEADING: Record<string, string> = {
  "Core Idea": "Core Idea",
  "Must Know": "Must Know",
  "Mechanism": "Mechanism",
  "DAT/Dental Trap": "Trap",
  "Memory Hook": "Memory Hook",
  "Recall Questions": "Recall Questions",
  "Source": "Source",
};

/** Render one note as a self-contained Markdown section (## heading + body). */
export function noteToMarkdown(note: UltraNote): string {
  const lines: string[] = [
    `## ${note.topic}`,
    `_Page ${note.pageNumber}${note.bookTitle ? ` · ${note.bookTitle}` : ""} · ${new Date(note.createdAt).toLocaleDateString()}_`,
    "",
  ];

  if (note.sections?.length) {
    for (const sec of note.sections) {
      lines.push(`### ${SECTION_HEADING[sec.label] ?? sec.label}`, sec.content, "");
    }
  } else {
    lines.push("### Core Idea", note.coreIdea || "—", "");
    if (note.professorNotes) {
      const pn = note.professorNotes;
      if (pn.whyItMatters)    lines.push("### Why This Matters", pn.whyItMatters, "");
      if (pn.keyMechanism)    lines.push("### Key Mechanism", pn.keyMechanism, "");
      if (pn.commonConfusion) lines.push("### Common Confusion", pn.commonConfusion, "");
      if (pn.memoryAnchor)    lines.push("### Memory Hook", pn.memoryAnchor, "");
      if (pn.reasoningFlow)   lines.push("### Reasoning Flow", pn.reasoningFlow, "");
      if (pn.examSignal)      lines.push("### Exam Signal", pn.examSignal, "");
    }
    for (const c of note.concepts) {
      lines.push(`### ${c.ordinal}. ${c.title}`);
      if (c.pattern)        lines.push(`**Pattern:** ${c.pattern}`);
      if (c.surgicalReason) lines.push(`**Why it works:** ${c.surgicalReason}`);
      if (c.trap)           lines.push(`**Trap:** ${c.trap}`);
      if (c.rule)           lines.push(`**Rule:** ${c.rule}`);
      lines.push("");
    }
  }

  if (note.memoryShortcuts?.length) {
    lines.push("### Memory Shortcuts", ...note.memoryShortcuts.map((s) => `- ${s}`), "");
  }
  if (note.miniTest?.length) {
    lines.push("### Recall Questions", ...note.miniTest.map((q, i) => `${i + 1}. ${q}`), "");
  }
  if (note.externalStudyLinks?.length) {
    lines.push("### Study Links", ...note.externalStudyLinks.map((l) => `- [${l.label}](https://www.google.com/search?q=${encodeURIComponent(l.searchQuery)})`), "");
  }

  return lines.join("\n");
}

export function notesToMarkdown(notes: UltraNote[], title: string): string {
  return [`# ${title}`, "", ...notes.map(noteToMarkdown)].join("\n\n---\n\n");
}

export function downloadNoteMarkdown(note: UltraNote): void {
  const md = noteToMarkdown(note);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  triggerDownload(URL.createObjectURL(blob), `${slugify(note.topic)}-p${note.pageNumber}.md`);
}

export function downloadNotesMarkdown(notes: UltraNote[], title: string): void {
  if (!notes.length) return;
  const md = notesToMarkdown(notes, title);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  triggerDownload(URL.createObjectURL(blob), `${slugify(title)}.md`);
}

/** jsPDF word-wrap helper, paginating when content runs past the page bottom. */
function addWrapped(doc: any, text: string, x: number, y: number, maxWidth: number, lineHeight: number, bottom = 760): number {
  if (!text) return y;
  const lines: string[] = doc.splitTextToSize(text, maxWidth);
  for (const line of lines) {
    if (y > bottom) {
      doc.addPage();
      y = 40;
    }
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

function renderNoteToPdf(doc: any, note: UltraNote, y: number): number {
  const left = 40;
  const width = 520;

  if (y > 700) {
    doc.addPage();
    y = 40;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  y = addWrapped(doc, note.topic, left, y, width, 18);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor("#666");
  y = addWrapped(doc, `Page ${note.pageNumber}${note.bookTitle ? ` · ${note.bookTitle}` : ""}`, left, y, width, 12);
  doc.setTextColor("#000");
  y += 6;

  doc.setFontSize(11);

  const section = (heading: string, body: string) => {
    if (!body) return;
    if (y > 740) { doc.addPage(); y = 40; }
    doc.setFont("helvetica", "bold");
    y = addWrapped(doc, heading, left, y, width, 14);
    doc.setFont("helvetica", "normal");
    y = addWrapped(doc, body, left, y, width, 14);
    y += 8;
  };

  if (note.sections?.length) {
    for (const sec of note.sections) section(SECTION_HEADING[sec.label] ?? sec.label, sec.content);
  } else {
    section("Core Idea", note.coreIdea);
    if (note.professorNotes) {
      const pn = note.professorNotes;
      section("Why This Matters", pn.whyItMatters || "");
      section("Key Mechanism", pn.keyMechanism || "");
      section("Common Confusion", pn.commonConfusion || "");
      section("Memory Hook", pn.memoryAnchor || "");
      section("Reasoning Flow", pn.reasoningFlow || "");
      section("Exam Signal", pn.examSignal || "");
    }
    note.concepts.forEach((c) => {
      section(`${c.ordinal}. ${c.title}`, [c.pattern, c.surgicalReason && `Why: ${c.surgicalReason}`, c.trap && `Trap: ${c.trap}`, c.rule && `Rule: ${c.rule}`].filter(Boolean).join("\n"));
    });
  }

  if (note.memoryShortcuts?.length) section("Memory Shortcuts", note.memoryShortcuts.map((s) => `• ${s}`).join("\n"));
  if (note.miniTest?.length) section("Recall Questions", note.miniTest.map((q, i) => `${i + 1}. ${q}`).join("\n"));

  return y + 14;
}

export async function downloadNotePdf(note: UltraNote): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  renderNoteToPdf(doc, note, 40);
  doc.save(`${slugify(note.topic)}-p${note.pageNumber}.pdf`);
}

export async function downloadNotesPdf(notes: UltraNote[], title: string): Promise<void> {
  if (!notes.length) return;
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title, 40, 40);
  let y = 70;
  notes.forEach((note, i) => {
    if (i > 0) {
      doc.addPage();
      y = 40;
    }
    y = renderNoteToPdf(doc, note, y);
  });
  doc.save(`${slugify(title)}.pdf`);
}
