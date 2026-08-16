// lib/elena/childBooks.ts
// Elena-owned upload/library — reuses the SAME PDF binary storage the adult
// Reader uses (lib/db/documentStore.ts) instead of a second parsing pipeline.
// documentId is a fresh crypto.randomUUID() per upload, matching how the
// adult Reader's guest/local upload path assigns identity (see
// resolveDocumentIdentity's preference order: real IDB documentId first).

import { saveDocumentFile, saveDocumentMeta, getDocumentFile } from "@/lib/db/documentStore";
import { saveChildLibraryEntry, listChildLibraryEntries, deleteChildLibraryEntry } from "./idbStore";
import type { ChildLibraryEntry } from "./types";

const TITLE_MAX_LENGTH = 120;

/** Strip a .pdf extension and clamp length — pure, no IO. */
export function deriveBookTitle(fileName: string): string {
  const stripped = fileName.replace(/\.pdf$/i, "").trim();
  const title = stripped.length > 0 ? stripped : "Untitled book";
  return title.length > TITLE_MAX_LENGTH ? title.slice(0, TITLE_MAX_LENGTH) : title;
}

/** Pure — builds the ChildLibraryEntry record for a freshly-uploaded book. */
export function buildChildLibraryEntry(
  fileName: string,
  documentId: string,
  childProfileId: string,
  now: string,
): ChildLibraryEntry {
  const title = deriveBookTitle(fileName);
  return {
    id: `${childProfileId}::${documentId}`,
    childProfileId,
    documentId,
    title,
    totalPages: 0,
    currentPage: 1,
    addedAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  };
}

/** Pure — merges a reading-position/page-count update into an existing entry. */
export function mergeLibraryEntryProgress(
  entry: ChildLibraryEntry,
  patch: { currentPage?: number; totalPages?: number },
  now: string,
): ChildLibraryEntry {
  return {
    ...entry,
    currentPage: patch.currentPage ?? entry.currentPage,
    totalPages: patch.totalPages ?? entry.totalPages,
    updatedAt: now,
  };
}

/** Pure — the book to resume is whichever entry was opened most recently. */
export function pickMostRecentEntry(entries: ChildLibraryEntry[]): ChildLibraryEntry | null {
  if (entries.length === 0) return null;
  return entries.reduce((latest, entry) =>
    entry.lastOpenedAt > latest.lastOpenedAt ? entry : latest,
  );
}

/**
 * Persists a newly-uploaded PDF into the shared document store and creates
 * this child's library entry for it. Does NOT extract page text or build
 * Thought Units — E2 scope is upload/open/navigate/resume only.
 */
export async function uploadChildBook(file: File, childProfileId: string): Promise<ChildLibraryEntry> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new Error("That file looks empty — please choose a different PDF.");
  }
  const documentId = crypto.randomUUID();
  const now = new Date().toISOString();

  await saveDocumentFile(documentId, buffer);
  await saveDocumentMeta({
    documentId,
    title: deriveBookTitle(file.name),
    mimeType: file.type || "application/pdf",
    byteLength: buffer.byteLength,
    createdAt: now,
    updatedAt: now,
    processingStatus: "complete",
    schemaVersion: 1,
  });

  const entry = buildChildLibraryEntry(file.name, documentId, childProfileId, now);
  await saveChildLibraryEntry(entry);
  return entry;
}

/** Resolves a blob: URL for an already-uploaded child book. Caller must revoke it. */
export async function loadChildBookFileUrl(documentId: string): Promise<string | null> {
  const data = await getDocumentFile(documentId);
  if (!data) return null;
  return URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
}

export async function recordBookOpened(entry: ChildLibraryEntry): Promise<ChildLibraryEntry> {
  const now = new Date().toISOString();
  const updated: ChildLibraryEntry = { ...entry, lastOpenedAt: now, updatedAt: now };
  await saveChildLibraryEntry(updated);
  return updated;
}

export async function updateBookProgress(
  entry: ChildLibraryEntry,
  patch: { currentPage?: number; totalPages?: number },
): Promise<ChildLibraryEntry> {
  const updated = mergeLibraryEntryProgress(entry, patch, new Date().toISOString());
  await saveChildLibraryEntry(updated);
  return updated;
}

export { listChildLibraryEntries, deleteChildLibraryEntry };
