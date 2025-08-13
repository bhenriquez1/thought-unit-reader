// hooks/usePdfSelection.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type PopupPosition = { x: number; y: number } | null;

export interface UsePdfSelectionOptions {
  /** Called when a non-empty selection is finalized (mouseup) */
  onSelect?: (text: string) => void;
  /** Minimum characters to treat as valid selection (default 2) */
  minChars?: number;

  /** If true, run diagram/formula heuristic & notify onDiagramDetected */
  autoWhiteboard?: boolean;
  /** Override the heuristic (optional) */
  containsDiagramOrFormula?: (text: string) => boolean;
  /** Called when a diagram-like selection is detected */
  onDiagramDetected?: (concept: string, context: string) => void;

  /** Provide current page for context like “From page X” */
  pageProvider?: () => number | undefined;
  /** Optional static context prefix (e.g., book name) */
  contextLabel?: string;

  /** Debounce selection finalization (ms). Default 0 (none). */
  debounceMs?: number;
}

export interface UsePdfSelection {
  /** Latest selected text (normalized) */
  selectionText: string;
  /** Manually set/clear selection text (doesn’t alter DOM selection) */
  setSelectionText: (t: string) => void;

  /** Tooltip position centered above current selection (or null) */
  popupPosition: PopupPosition;

  /** The captured DOM Range (if available) */
  selectionRangeRef: React.MutableRefObject<Range | null>;

  /** Spread this onto any pane that should capture selections */
  bind: { onMouseUp: (e: React.MouseEvent) => void };

  /** Clear hook state + DOM selection */
  clearSelection: () => void;

  /** Try to restore the captured selection range (best-effort) */
  restoreSelection: () => void;

  /** Copy current selection to clipboard (no-op if empty) */
  copySelectionToClipboard: () => Promise<void>;

  /** Ask server to expand the selection into a detailed note */
  createDetailedNote: (opts?: {
    discipline?: string;
    style?: "detailed" | "succinct" | "mnemonic";
    voice?: string;
  }) => Promise<string | null>;

  /** True while selection meets minChars */
  isActive: boolean;

  /** Timestamp (ms) when last selection happened */
  lastSelectedAt: number | null;
}

function defaultDiagramHeuristic(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(diagram|figure|fig\.|table|chart|graph|flow|formula|equation|reaction|proof)\b/.test(t))
    return true;
  // common math/chem symbols
  if (/[∑∏∫√≈≠≤≥→↔⇌Δ±∞μ°Ωπθαβγλ≃≅⊂⊃∈∉∧∨⊗◦]/.test(text)) return true;
  return false;
}

function getWindowSelectionText(): string {
  if (typeof window === "undefined") return "";
  try {
    return (window.getSelection()?.toString() || "").trim();
  } catch {
    return "";
  }
}

function getSelectionRect(): DOMRect | null {
  if (typeof window === "undefined") return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  try {
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect && (rect.width > 0 || rect.height > 0)) return rect;
    const rects = range.getClientRects();
    if (rects && rects.length > 0) return rects[0];
  } catch {
    // ignore
  }
  return null;
}

export function usePdfSelection(opts: UsePdfSelectionOptions = {}): UsePdfSelection {
  const {
    onSelect,
    minChars = 2,
    autoWhiteboard = false,
    containsDiagramOrFormula = defaultDiagramHeuristic,
    onDiagramDetected,
    pageProvider,
    contextLabel,
    debounceMs = 0,
  } = opts;

  const [selectionText, _setSelectionText] = useState<string>("");
  const [popupPosition, setPopupPosition] = useState<PopupPosition>(null);
  const [lastSelectedAt, setLastSelectedAt] = useState<number | null>(null);
  const selectionRangeRef = useRef<Range | null>(null);
  const timerRef = useRef<number | null>(null);

  const isActive = selectionText.length >= minChars;

  const setSelectionText = useCallback((t: string) => {
    _setSelectionText(t);
    setLastSelectedAt(Date.now());
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const finalizeSelection = useCallback(() => {
    const text = getWindowSelectionText();
    if (!text || text.length < minChars) {
      _setSelectionText("");
      setPopupPosition(null);
      selectionRangeRef.current = null;
      return;
    }

    // capture DOM range
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        selectionRangeRef.current = sel.getRangeAt(0).cloneRange();
      }
    } catch {
      selectionRangeRef.current = null;
    }

    // popup position
    const rect = getSelectionRect();
    if (rect) {
      setPopupPosition({
        x: rect.left + rect.width / 2 + window.scrollX,
        y: rect.top + window.scrollY - 10,
      });
    } else {
      setPopupPosition(null);
    }

    _setSelectionText(text);
    setLastSelectedAt(Date.now());
    onSelect?.(text);

    if (autoWhiteboard && containsDiagramOrFormula(text)) {
      const pg = pageProvider?.();
      const ctx = contextLabel ?? (typeof pg === "number" ? `From page ${pg}` : "From current page");
      onDiagramDetected?.(text, ctx);
    }
  }, [
    onSelect,
    minChars,
    autoWhiteboard,
    containsDiagramOrFormula,
    onDiagramDetected,
    pageProvider,
    contextLabel,
  ]);

  const handleMouseUp = useCallback(
    (_e: React.MouseEvent) => {
      if (debounceMs > 0) {
        clearTimer();
        timerRef.current = window.setTimeout(finalizeSelection, debounceMs) as unknown as number;
      } else {
        finalizeSelection();
      }
    },
    [finalizeSelection, debounceMs, clearTimer]
  );

  const clearSelection = useCallback(() => {
    _setSelectionText("");
    setPopupPosition(null);
    setLastSelectedAt(null);
    selectionRangeRef.current = null;
    if (typeof window !== "undefined") {
      try {
        const sel = window.getSelection();
        sel?.removeAllRanges();
      } catch {
        // ignore
      }
    }
  }, []);

  const restoreSelection = useCallback(() => {
    if (typeof window === "undefined") return;
    const r = selectionRangeRef.current;
    if (!r) return;
    try {
      const sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(r);
    } catch {
      // ignore
    }
  }, []);

  const copySelectionToClipboard = useCallback(async () => {
    if (!selectionText) return;
    try {
      await navigator.clipboard.writeText(selectionText);
    } catch {
      // ignore
    }
  }, [selectionText]);

  const createDetailedNote = useCallback(
    async (params?: {
      discipline?: string;
      style?: "detailed" | "succinct" | "mnemonic";
      voice?: string;
    }) => {
      const text = selectionText.trim();
      if (!text) return null;
      try {
        const res = await fetch("/api/annotate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            discipline: params?.discipline ?? "dentistry",
            style: params?.style ?? "detailed",
            voice: params?.voice,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        return (data?.detailedNote as string) || text;
      } catch {
        return text; // graceful fallback
      }
    },
    [selectionText]
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  const bind = useMemo(() => ({ onMouseUp: handleMouseUp }), [handleMouseUp]);

  return {
    selectionText,
    setSelectionText,
    popupPosition,
    selectionRangeRef,
    bind,
    clearSelection,
    restoreSelection,
    copySelectionToClipboard,
    createDetailedNote,
    isActive,
    lastSelectedAt,
  };
}