// lib/canonical/viewSourceLink.ts
// localStorage handoff that lets DAT Apex navigate the Reader to the exact
// page and text passage a question was generated from.
//
// Usage:
//   1. Apex results page calls writeViewSourceLink({...}) then navigates to '/'.
//   2. Reader mount effect calls readAndClearViewSourceLink() and jumps to the page.

export interface ViewSourceLink {
  /** documentId used in the canonical store — typically the file name without .pdf */
  documentId: string;
  /** 1-based page number to jump to in the Reader */
  pageNumber: number;
  /** CanonicalThoughtUnit IDs on this page — used for precise highlight if available */
  unitIds?: string[];
  /** Short representative quote (≤ 180 chars) shown in the Reader banner */
  quote?: string;
  /** Book title for display */
  bookTitle?: string;
}

const LS_KEY = 'avrrio:view-source-link';

export function writeViewSourceLink(link: ViewSourceLink): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(link)); } catch { /* quota — non-fatal */ }
}

/** Read and clear in one operation — prevents stale links from being re-applied. */
export function readAndClearViewSourceLink(): ViewSourceLink | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    localStorage.removeItem(LS_KEY);
    return JSON.parse(raw) as ViewSourceLink;
  } catch { return null; }
}
