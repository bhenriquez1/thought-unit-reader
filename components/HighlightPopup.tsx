// components/HighlightPopup.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

interface HighlightPopupProps {
  position: { x: number; y: number };
  selectionText?: string;

  onCreateNote: () => void;

  /** Trigger your “top student dental note” flow.
   *  You can call sel.createDetailedNote() inside the handler.
   *  If it returns a Promise, we show a busy state until it settles.
   */
  onCreateDetailedNote?: () => void | Promise<void>;

  /** If you already manage busy state externally, pass it to sync the UI. */
  creatingDetailedNote?: boolean;

  onAddFlashcard: () => void;
  onAttachLink: () => void;
  onClose: () => void;

  /** ms before auto-close. Set 0 to disable. Default: 5000 */
  autoCloseMs?: number;
}

export default function HighlightPopup({
  position,
  selectionText = "",
  onCreateNote,
  onCreateDetailedNote,
  creatingDetailedNote,
  onAddFlashcard,
  onAttachLink,
  onClose,
  autoCloseMs = 5000,
}: HighlightPopupProps) {
  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [internalBusy, setInternalBusy] = useState(false);

  // If parent supplies creatingDetailedNote, prefer it; else use internal
  const isBusy = Boolean(creatingDetailedNote ?? internalBusy);

  const popupRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Short preview of the selected text
  const preview = useMemo(() => {
    const t = selectionText.trim().replace(/\s+/g, " ");
    if (!t) return "";
    return t.length > 140 ? t.slice(0, 140) + "…" : t;
  }, [selectionText]);

  /** Fade in on mount */
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  /** ESC key closes */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Auto-close unless hovered or busy */
  useEffect(() => {
    if (!autoCloseMs) return;
    startAutoFadeTimer();
    return stopAutoFadeTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCloseMs, isBusy]);

  const startAutoFadeTimer = () => {
    stopAutoFadeTimer();
    if (!autoCloseMs || isBusy) return;
    timerRef.current = setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => onClose(), 250);
    }, autoCloseMs);
  };

  const stopAutoFadeTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  /** Close when clicking outside */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const handleCreateDetailed = async () => {
    if (!onCreateDetailedNote) return;
    try {
      setInternalBusy(true);
      await onCreateDetailedNote();
    } finally {
      setInternalBusy(false);
    }
  };

  return (
    <motion.div
      ref={popupRef}
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{
        opacity: visible && !fadeOut ? 1 : 0,
        y: visible && !fadeOut ? 0 : 10,
        scale: visible && !fadeOut ? 1 : 0.95,
        x: position.x,
        top: position.y,
      }}
      transition={{ type: "spring", stiffness: 350, damping: 25, mass: 0.8 }}
      style={{
        position: "absolute",
        left: 0,
        transform: "translate(-50%, -100%)",
        zIndex: 9999,
        pointerEvents: "auto",
      }}
      onMouseEnter={stopAutoFadeTimer}
      onMouseLeave={startAutoFadeTimer}
    >
      <div className="bg-gray-900 text-white rounded-lg shadow-lg border border-gray-700 p-2 w-[min(460px,90vw)]">
        {/* Preview line */}
        {preview && (
          <div className="px-2 pt-1 pb-2 text-xs text-gray-300 border-b border-gray-700/60">
            “{preview}”
          </div>
        )}

        {/* Action row */}
        <div className="flex items-center gap-2 px-2 pt-2">
          <button
            onClick={onCreateNote}
            className="hover:text-yellow-400 transition-colors disabled:opacity-50"
            title="Create Note"
            aria-label="Create Note"
            disabled={isBusy}
          >
            📝
          </button>

          {onCreateDetailedNote && (
            <button
              onClick={handleCreateDetailed}
              className="hover:text-amber-400 transition-colors disabled:opacity-50"
              title="Detailed Note (Top Student)"
              aria-label="Detailed Note"
              disabled={isBusy}
            >
              {isBusy ? "⏳" : "🧠"}
            </button>
          )}

          <button
            onClick={onAddFlashcard}
            className="hover:text-green-400 transition-colors disabled:opacity-50"
            title="Add Flashcard"
            aria-label="Add Flashcard"
            disabled={isBusy}
          >
            🎯
          </button>

          <button
            onClick={onAttachLink}
            className="hover:text-blue-400 transition-colors disabled:opacity-50"
            title="Attach Link / Video"
            aria-label="Attach Link or Video"
            disabled={isBusy}
          >
            🔗
          </button>

          <div className="flex-1" />

          <button
            onClick={onClose}
            className="hover:text-red-400 transition-colors disabled:opacity-50"
            title="Close"
            aria-label="Close popup"
            disabled={isBusy}
          >
            ✖
          </button>
        </div>
      </div>
    </motion.div>
  );
}