// lib/notelab/exportNote.ts
// Export UltraNotes to Markdown / PDF — local download, no cloud/OAuth dependency.

import type { UltraNote } from "./ultraNoteStore";
import type { NoteCard } from "@/lib/insights/synthesizeTeachingOutput";
import { getSectionLens, getProfessorFieldLabel, getConceptFieldLabel, type ProfessionMode } from "./professionModes";
import { NOTE_CARD_STYLE } from "./noteCardStyle";

/** Degrades a card's visual (diagram/connection-map/decision-tree) to a text-only
 *  bullet list of nodes and relationships — no rasterized image in this pass. */
function noteCardVisualToLines(card: NoteCard): string[] {
  if (!card.visual) return [];
  const lines: string[] = [`${card.visual.drawType.toUpperCase()} DIAGRAM:`];
  for (const node of card.visual.nodes) lines.push(`  • ${node.label}`);
  for (const arrow of card.visual.arrows) {
    const fromLabel = card.visual.nodes.find((n) => n.id === arrow.from)?.label ?? arrow.from;
    const toLabel = card.visual.nodes.find((n) => n.id === arrow.to)?.label ?? arrow.to;
    lines.push(`  → ${fromLabel} → ${toLabel}${arrow.label ? ` (${arrow.label})` : ""}`);
  }
  return lines;
}

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

/** Render one note as a self-contained Markdown section (## heading + body). */
export function noteToMarkdown(note: UltraNote, mode: ProfessionMode = "default"): string {
  const lines: string[] = [
    `## ${note.topic}`,
    `_Page ${note.pageNumber}${note.bookTitle ? ` · ${note.bookTitle}` : ""} · ${new Date(note.createdAt).toLocaleDateString()}_`,
    "",
  ];

  if (note.noteCards?.length) {
    for (const card of note.noteCards) {
      const style = NOTE_CARD_STYLE[card.type] ?? NOTE_CARD_STYLE.other;
      const lens = getSectionLens(mode, style.label);
      lines.push(`### ${style.icon} ${card.title || lens?.label || style.label}`, card.body, "");
      const visualLines = noteCardVisualToLines(card);
      if (visualLines.length) lines.push(...visualLines, "");
    }
  } else if (note.sections?.length) {
    for (const sec of note.sections) {
      const lens = getSectionLens(mode, sec.label);
      lines.push(`### ${lens?.label ?? sec.label}`, sec.content, "");
    }
  } else {
    lines.push(`### ${getSectionLens(mode, "Core Idea")?.label ?? "Core Idea"}`, note.coreIdea || "—", "");
    if (note.professorNotes) {
      const pn = note.professorNotes;
      if (pn.whyItMatters)    lines.push(`### ${getProfessorFieldLabel(mode, "whyItMatters")}`, pn.whyItMatters, "");
      if (pn.keyMechanism)    lines.push(`### ${getProfessorFieldLabel(mode, "keyMechanism")}`, pn.keyMechanism, "");
      if (pn.commonConfusion) lines.push(`### ${getProfessorFieldLabel(mode, "commonConfusion")}`, pn.commonConfusion, "");
      if (pn.memoryAnchor)    lines.push(`### ${getProfessorFieldLabel(mode, "memoryAnchor")}`, pn.memoryAnchor, "");
      if (pn.reasoningFlow)   lines.push(`### ${getProfessorFieldLabel(mode, "reasoningFlow")}`, pn.reasoningFlow, "");
      if (pn.examSignal)      lines.push(`### ${getProfessorFieldLabel(mode, "examSignal")}`, pn.examSignal, "");
    }
    for (const c of note.concepts) {
      lines.push(`### ${c.ordinal}. ${c.title}`);
      if (c.pattern)        lines.push(`**${getConceptFieldLabel(mode, "pattern")}:** ${c.pattern}`);
      if (c.surgicalReason) lines.push(`**${getConceptFieldLabel(mode, "surgicalReason")}:** ${c.surgicalReason}`);
      if (c.trap)           lines.push(`**${getConceptFieldLabel(mode, "trap")}:** ${c.trap}`);
      if (c.rule)           lines.push(`**${getConceptFieldLabel(mode, "rule")}:** ${c.rule}`);
      lines.push("");
    }
  }

  if (note.memoryShortcuts?.length) {
    lines.push(`### ${getSectionLens(mode, "Memory Hook")?.label ?? "Memory Shortcuts"}`, ...note.memoryShortcuts.map((s) => `- ${s}`), "");
  }
  if (note.miniTest?.length) {
    lines.push(`### ${getSectionLens(mode, "Recall Questions")?.label ?? "Recall Questions"}`, ...note.miniTest.map((q, i) => `${i + 1}. ${q}`), "");
  }
  if (note.externalStudyLinks?.length) {
    lines.push("### Study Links", ...note.externalStudyLinks.map((l) => `- [${l.label}](https://www.google.com/search?q=${encodeURIComponent(l.searchQuery)})`), "");
  }

  return lines.join("\n");
}

export function notesToMarkdown(notes: UltraNote[], title: string, mode: ProfessionMode = "default"): string {
  return [`# ${title}`, "", ...notes.map((n) => noteToMarkdown(n, mode))].join("\n\n---\n\n");
}

export function downloadNoteMarkdown(note: UltraNote, mode: ProfessionMode = "default"): void {
  const md = noteToMarkdown(note, mode);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  triggerDownload(URL.createObjectURL(blob), `${slugify(note.topic)}-p${note.pageNumber}.md`);
}

export function downloadNotesMarkdown(notes: UltraNote[], title: string, mode: ProfessionMode = "default"): void {
  if (!notes.length) return;
  const md = notesToMarkdown(notes, title, mode);
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

function renderNoteToPdf(doc: any, note: UltraNote, y: number, mode: ProfessionMode = "default"): number {
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

  if (note.noteCards?.length) {
    for (const card of note.noteCards) {
      const style = NOTE_CARD_STYLE[card.type] ?? NOTE_CARD_STYLE.other;
      const lens = getSectionLens(mode, style.label);
      const visualLines = noteCardVisualToLines(card);
      section(
        `${style.icon} ${card.title || lens?.label || style.label}`,
        visualLines.length ? `${card.body}\n\n${visualLines.join("\n")}` : card.body,
      );
    }
  } else if (note.sections?.length) {
    for (const sec of note.sections) section(getSectionLens(mode, sec.label)?.label ?? sec.label, sec.content);
  } else {
    section(getSectionLens(mode, "Core Idea")?.label ?? "Core Idea", note.coreIdea);
    if (note.professorNotes) {
      const pn = note.professorNotes;
      section(getProfessorFieldLabel(mode, "whyItMatters"), pn.whyItMatters || "");
      section(getProfessorFieldLabel(mode, "keyMechanism"), pn.keyMechanism || "");
      section(getProfessorFieldLabel(mode, "commonConfusion"), pn.commonConfusion || "");
      section(getProfessorFieldLabel(mode, "memoryAnchor"), pn.memoryAnchor || "");
      section(getProfessorFieldLabel(mode, "reasoningFlow"), pn.reasoningFlow || "");
      section(getProfessorFieldLabel(mode, "examSignal"), pn.examSignal || "");
    }
    note.concepts.forEach((c) => {
      section(`${c.ordinal}. ${c.title}`, [
        c.pattern,
        c.surgicalReason && `${getConceptFieldLabel(mode, "surgicalReason")}: ${c.surgicalReason}`,
        c.trap && `${getConceptFieldLabel(mode, "trap")}: ${c.trap}`,
        c.rule && `${getConceptFieldLabel(mode, "rule")}: ${c.rule}`,
      ].filter(Boolean).join("\n"));
    });
  }

  if (note.memoryShortcuts?.length) section(getSectionLens(mode, "Memory Hook")?.label ?? "Memory Shortcuts", note.memoryShortcuts.map((s) => `• ${s}`).join("\n"));
  if (note.miniTest?.length) section(getSectionLens(mode, "Recall Questions")?.label ?? "Recall Questions", note.miniTest.map((q, i) => `${i + 1}. ${q}`).join("\n"));

  return y + 14;
}

export async function downloadNotePdf(note: UltraNote, mode: ProfessionMode = "default"): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  renderNoteToPdf(doc, note, 40, mode);
  doc.save(`${slugify(note.topic)}-p${note.pageNumber}.pdf`);
}

export async function downloadNotesPdf(notes: UltraNote[], title: string, mode: ProfessionMode = "default"): Promise<void> {
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
    y = renderNoteToPdf(doc, note, y, mode);
  });
  doc.save(`${slugify(title)}.pdf`);
}

// ── DOCX export ─────────────────────────────────────────────────────────────
// Loaded via dynamic import(), same pattern as the jsPDF usage above.
// Diagram/visual cards degrade to the same text-only bullet list used by the
// Markdown/PDF exporters — no rasterized image (SVG→PNG embedding is out of
// scope for this pass).

function noteToDocxSections(note: UltraNote, docxLib: typeof import("docx"), mode: ProfessionMode): InstanceType<typeof import("docx").Paragraph>[] {
  const { Paragraph, TextRun, HeadingLevel } = docxLib;
  const paras: InstanceType<typeof Paragraph>[] = [];

  paras.push(new Paragraph({ text: note.topic, heading: HeadingLevel.HEADING_1 }));
  paras.push(new Paragraph({
    children: [new TextRun({
      text: `Page ${note.pageNumber}${note.bookTitle ? ` · ${note.bookTitle}` : ""} · ${new Date(note.createdAt).toLocaleDateString()}`,
      italics: true,
      color: "666666",
    })],
  }));

  const section = (heading: string, body: string) => {
    if (!body) return;
    paras.push(new Paragraph({ text: heading, heading: HeadingLevel.HEADING_2, spacing: { before: 200 } }));
    for (const line of body.split("\n")) {
      paras.push(new Paragraph({ text: line }));
    }
  };

  if (note.noteCards?.length) {
    for (const card of note.noteCards) {
      const style = NOTE_CARD_STYLE[card.type] ?? NOTE_CARD_STYLE.other;
      const lens = getSectionLens(mode, style.label);
      const visualLines = noteCardVisualToLines(card);
      section(
        `${style.icon} ${card.title || lens?.label || style.label}`,
        visualLines.length ? `${card.body}\n\n${visualLines.join("\n")}` : card.body,
      );
    }
  } else if (note.sections?.length) {
    for (const sec of note.sections) section(getSectionLens(mode, sec.label)?.label ?? sec.label, sec.content);
  } else {
    section(getSectionLens(mode, "Core Idea")?.label ?? "Core Idea", note.coreIdea);
    if (note.professorNotes) {
      const pn = note.professorNotes;
      section(getProfessorFieldLabel(mode, "whyItMatters"), pn.whyItMatters || "");
      section(getProfessorFieldLabel(mode, "keyMechanism"), pn.keyMechanism || "");
      section(getProfessorFieldLabel(mode, "commonConfusion"), pn.commonConfusion || "");
      section(getProfessorFieldLabel(mode, "memoryAnchor"), pn.memoryAnchor || "");
      section(getProfessorFieldLabel(mode, "reasoningFlow"), pn.reasoningFlow || "");
      section(getProfessorFieldLabel(mode, "examSignal"), pn.examSignal || "");
    }
    note.concepts.forEach((c) => {
      section(`${c.ordinal}. ${c.title}`, [
        c.pattern,
        c.surgicalReason && `${getConceptFieldLabel(mode, "surgicalReason")}: ${c.surgicalReason}`,
        c.trap && `${getConceptFieldLabel(mode, "trap")}: ${c.trap}`,
        c.rule && `${getConceptFieldLabel(mode, "rule")}: ${c.rule}`,
      ].filter(Boolean).join("\n"));
    });
  }

  if (note.memoryShortcuts?.length) section(getSectionLens(mode, "Memory Hook")?.label ?? "Memory Shortcuts", note.memoryShortcuts.map((s) => `• ${s}`).join("\n"));
  if (note.miniTest?.length) section(getSectionLens(mode, "Recall Questions")?.label ?? "Recall Questions", note.miniTest.map((q, i) => `${i + 1}. ${q}`).join("\n"));

  return paras;
}

export async function noteToDocxBlob(note: UltraNote, mode: ProfessionMode = "default"): Promise<Blob> {
  const docxLib = await import("docx");
  const { Document, Packer } = docxLib;
  const doc = new Document({
    sections: [{ children: noteToDocxSections(note, docxLib, mode) }],
  });
  return Packer.toBlob(doc);
}

export async function notesToDocxBlob(notes: UltraNote[], title: string, mode: ProfessionMode = "default"): Promise<Blob> {
  const docxLib = await import("docx");
  const { Document, Packer, Paragraph, HeadingLevel, PageBreak } = docxLib;
  const children: InstanceType<typeof Paragraph>[] = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })];
  notes.forEach((note, i) => {
    if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(...noteToDocxSections(note, docxLib, mode));
  });
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}

export async function downloadNoteDocx(note: UltraNote, mode: ProfessionMode = "default"): Promise<void> {
  const blob = await noteToDocxBlob(note, mode);
  triggerDownload(URL.createObjectURL(blob), `${slugify(note.topic)}-p${note.pageNumber}.docx`);
}

export async function downloadNotesDocx(notes: UltraNote[], title: string, mode: ProfessionMode = "default"): Promise<void> {
  if (!notes.length) return;
  const blob = await notesToDocxBlob(notes, title, mode);
  triggerDownload(URL.createObjectURL(blob), `${slugify(title)}.docx`);
}
