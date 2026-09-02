// lib/library/userLibrary.ts
// TestLab source-binding fix — "TestLab source selection must come from the
// same persistent Library/Firebase document records used by Reader." This
// is that one shared read path: the exact same two data sources
// pages/index.tsx's own "My Library" drawer reads (lib/firebase.ts's
// Firestore users/{uid}/library for signed-in users, the
// 'avrrio-local-library' localStorage mirror for guests) — not a third,
// independent catalogue.
//
// Bundle-size note: app/apex/** (App Router) deliberately avoids a static
// top-level import of lib/firebase.ts — see
// lib/apex/currentApexUserId.ts's own header comment on the measured
// First Load JS cost of pulling the Firebase SDK into every apex route.
// loadUserLibrary() only ever dynamically imports lib/firebase.ts inside
// an async function, so routes that never call this (app/apex/proctor,
// app/apex/results, etc.) pay nothing for it.

export interface LibraryRecord {
  /** Stable identity — SHA-256 content hash for a signed-in upload, or a
   *  generated local id for a guest upload. Never derived from title or
   *  filename. */
  documentId: string;
  title: string;
  url: string;
  uploadedAt: string;
  isLocal: boolean;
  localDocumentId?: string;
  /** The filename-derived key every content-grounding lookup elsewhere in
   *  the app (notes, KnowledgeNodes, recall) already uses — see
   *  lib/insights/resolveDocumentIdentity.ts's own header comment. Derived
   *  here from the same Library record's title, not tracked independently,
   *  so it can never drift from the record it came from. */
  bookId: string;
}

const LOCAL_LIBRARY_KEY = "avrrio-local-library";

export function deriveBookIdFromFilename(name: string): string {
  return name.replace(/\.[Pp][Dd][Ff]$/, "") || "book";
}

function loadLocalLibrary(): LibraryRecord[] {
  // Checks localStorage directly (not `typeof window`) — the only thing
  // this function actually needs, and unlike window it's still present in
  // this repo's own jest test environment (see tests/setup.ts's global
  // localStorage polyfill), so a real behavioral test doesn't need to
  // stub window just to exercise this path.
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_LIBRARY_KEY);
    if (!raw) return [];
    const entries = JSON.parse(raw) as Array<{ id: string; name: string; uploadedAt: string; localDocumentId: string }>;
    if (!Array.isArray(entries)) return [];
    return entries
      .filter((e) => e?.id && e?.name && e?.localDocumentId)
      .map((e) => ({
        documentId: e.id,
        title: e.name,
        url: "",
        uploadedAt: e.uploadedAt ?? "",
        isLocal: true,
        localDocumentId: e.localDocumentId,
        bookId: deriveBookIdFromFilename(e.name),
      }));
  } catch {
    return [];
  }
}

/** Resolves the current Firebase-signed-in uid once, or null for a guest.
 *  Dynamically imports lib/firebase.ts's own listenForAuthChanges rather
 *  than building a second auth-state mechanism. */
async function resolveCurrentFirebaseUid(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const { listenForAuthChanges } = await import("@/lib/firebase");
    return await new Promise<string | null>((resolve) => {
      let settled = false;
      const unsubscribe = listenForAuthChanges((user) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        resolve(user?.uid ?? null);
      });
      setTimeout(() => {
        if (settled) return;
        settled = true;
        unsubscribe();
        resolve(null);
      }, 4000);
    });
  } catch {
    return null;
  }
}

/** The single canonical Library — sorted most-recently-uploaded first.
 *  Every consumer (Reader's drawer, NoteLab, Recall, Learning Hub, TestLab)
 *  should read this instead of maintaining its own book list. */
export async function loadUserLibrary(): Promise<LibraryRecord[]> {
  const uid = await resolveCurrentFirebaseUid();
  if (uid) {
    try {
      const { getPDFLibrary } = await import("@/lib/firebase");
      const entries = await getPDFLibrary(uid);
      return entries
        .map((e) => ({
          documentId: e.id,
          title: e.name,
          url: e.url,
          uploadedAt: e.uploadedAt,
          isLocal: false,
          bookId: deriveBookIdFromFilename(e.name),
        }))
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    } catch {
      return [];
    }
  }
  return loadLocalLibrary().sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
}
