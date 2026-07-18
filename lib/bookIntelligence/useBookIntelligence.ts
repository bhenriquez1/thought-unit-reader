// lib/bookIntelligence/useBookIntelligence.ts
// React hook for loading and triggering Book Intelligence classification.
//
// Usage:
//   const { intelligence, loading, classify } = useBookIntelligence(documentId);
//
// On mount:
//   1. Checks IDB for an existing, non-stale BookIntelligence record.
//   2. If found, returns it immediately — no API call.
//   3. If not found (or version-stale), the caller must invoke `classify(signals)`
//      with available document evidence to trigger classification.
//
// classify() is idempotent within a session: if a request is in flight it
// does not fire a second one.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BookIntelligence } from "./types";
import { loadBookIntelligence, saveBookIntelligence } from "./store";
import type { ClassifyDocumentRequest } from "@/pages/api/classify-document";

export type BookIntelligenceState = {
  intelligence: BookIntelligence | null;
  loading: boolean;
  error: string | null;
  /** Trigger classification with available document signals. Safe to call multiple times. */
  classify: (signals: Omit<ClassifyDocumentRequest, "documentId">) => Promise<void>;
};

export function useBookIntelligence(documentId: string | null | undefined): BookIntelligenceState {
  const [intelligence, setIntelligence] = useState<BookIntelligence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const currentDocRef = useRef<string | null>(null);

  // Load from IDB when documentId changes.
  useEffect(() => {
    if (!documentId) { setIntelligence(null); return; }
    currentDocRef.current = documentId;
    setIntelligence(null);
    setError(null);

    loadBookIntelligence(documentId).then((stored) => {
      if (currentDocRef.current !== documentId) return;
      if (stored) setIntelligence(stored);
    }).catch(() => {
      // IDB unavailable (SSR, private-mode restrictions) — no-op, will classify fresh.
    });
  }, [documentId]);

  const classify = useCallback(async (signals: Omit<ClassifyDocumentRequest, "documentId">) => {
    if (!documentId) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/classify-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, ...signals }),
      });
      const data = await res.json();
      if (!res.ok || !data.intelligence) {
        setError(data?.error ?? "Classification failed");
        return;
      }
      setIntelligence(data.intelligence);
      await saveBookIntelligence(data.intelligence).catch(() => {
        // IDB write failure is non-fatal; intelligence is still in state.
      });
    } catch (err: any) {
      setError(err?.message ?? "Classification request failed");
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [documentId]);

  return { intelligence, loading, error, classify };
}
