// components/HighlightPopup.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

interface HighlightPopupProps {
  position: { x: number; y: number };
  selectionText?: string;

  onCreateNote: () => void;
  /** Optional: trigger your “top student dental note” pipeline */
  onCreateDetailedNote?: () => void;
  onAddFlashcard: () => void;
  onAttachLink: () => void;
  onClose: () => void;

  /** Optional: ms before auto-close (default 5000). Set 0 to disable */
  autoCloseMs?: number;
}

export default function HighlightPopup({
  position,
  selectionText = "",
  onCreateNote,
  onCreateDetailedNote,
  onAddFlashcard,
  onAttachLink,
  onClose,
  autoCloseMs = 5000,
}: HighlightPopupProps) {
  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
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

  /** Auto-close unless hovered */
  useEffect(() => {
    if (!autoCloseMs) return;
    startAutoFadeTimer();
    return stopAutoFadeTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCloseMs]);

  const startAutoFadeTimer = () => {
    stopAutoFadeTimer();
    if (!autoCloseMs) return;
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
      <div className="bg-gray-900 text-white rounded-lg shadow-lg border border-gray-700 p-2 w-[min(420px,90vw)]">
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
            className="hover:text-yellow-400 transition-colors"
            title="Create Note"
            aria-label="Create Note"
          >
            📝
          </button>

          {onCreateDetailedNote && (
            <button
              onClick={onCreateDetailedNote}
              className="hover:text-amber-400 transition-colors"
              title="Detailed Note (Top Student)"
              aria-label="Detailed Note"
            >
              🧠
            </button>
          )}

          <button
            onClick={onAddFlashcard}
            className="hover:text-green-400 transition-colors"
            title="Add Flashcard"
            aria-label="Add Flashcard"
          >
            🎯
          </button>

          <button
            onClick={onAttachLink}
            className="hover:text-blue-400 transition-colors"
            title="Attach Link / Video"
            aria-label="Attach Link or Video"
          >
            🔗
          </button>

          <div className="flex-1" />

          <button
            onClick={onClose}
            className="hover:text-red-400 transition-colors"
            title="Close"
            aria-label="Close popup"
          >
            ✖
          </button>
        </div>
      </div>
    </motion.div>
  );
}