import React, { useEffect, useState } from 'react';

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

  useEffect(() => {
    // Small delay to trigger CSS animation
    const timer = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        top: `${position.y}px`,
        left: `${position.x}px`,
        transform: 'translate(-50%, -100%)',
        zIndex: 9999,
      }}
      className={`transition-all duration-200 ease-out ${
        visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-95'
      }`}
    >
      <div className="bg-gray-900 text-white rounded-lg shadow-lg border border-gray-700 flex items-center space-x-2 px-3 py-2">
        {/* Create Note */}
        <button
          onClick={onCreateNote}
          className="hover:text-yellow-400 transition-colors"
          title="Create Note"
        >
          📝
        </button>

        {/* Add Flashcard */}
        <button
          onClick={onAddFlashcard}
          className="hover:text-green-400 transition-colors"
          title="Add Flashcard"
        >
          🎯
        </button>

        {/* Attach Link */}
        <button
          onClick={onAttachLink}
          className="hover:text-blue-400 transition-colors"
          title="Attach Link / Video"
        >
          🔗
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          className="hover:text-red-400 transition-colors"
          title="Close"
        >
          ✖
        </button>
      </div>
    </div>
  );
}