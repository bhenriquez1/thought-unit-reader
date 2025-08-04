import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface HighlightPopupProps {
  position: { x: number; y: number };
  onCreateNote: () => void;
  onAddFlashcard: () => void;
  onAttachLink: () => void;
  onClose: () => void;
}

export default function HighlightPopup({
  position,
  onCreateNote,
  onAddFlashcard,
  onAttachLink,
  onClose,
}: HighlightPopupProps) {
  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  /** Fade in on mount */
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  /** Auto-close after 5s unless hovered */
  useEffect(() => {
    startAutoFadeTimer();
    return stopAutoFadeTimer;
  }, []);

  const startAutoFadeTimer = () => {
    stopAutoFadeTimer();
    timerRef.current = setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => onClose(), 300);
    }, 5000);
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
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
      transition={{
        type: 'spring',
        stiffness: 350,
        damping: 25,
        mass: 0.8,
      }}
      style={{
        position: 'absolute',
        left: 0,
        transform: 'translate(-50%, -100%)',
        zIndex: 9999,
      }}
      onMouseEnter={stopAutoFadeTimer}
      onMouseLeave={startAutoFadeTimer}
    >
      <div className="bg-gray-900 text-white rounded-lg shadow-lg border border-gray-700 flex items-center space-x-2 px-3 py-2">
        <button
          onClick={onCreateNote}
          className="hover:text-yellow-400 transition-colors"
          title="Create Note"
        >
          📝
        </button>
        <button
          onClick={onAddFlashcard}
          className="hover:text-green-400 transition-colors"
          title="Add Flashcard"
        >
          🎯
        </button>
        <button
          onClick={onAttachLink}
          className="hover:text-blue-400 transition-colors"
          title="Attach Link / Video"
        >
          🔗
        </button>
        <button
          onClick={onClose}
          className="hover:text-red-400 transition-colors"
          title="Close"
        >
          ✖
        </button>
      </div>
    </motion.div>
  );
}