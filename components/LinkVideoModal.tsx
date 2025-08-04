// components/LinkVideoModal.tsx
import React, { useState } from 'react';

interface LinkVideoModalProps {
  onClose: () => void;
  onSave: (url: string) => void;
}

export default function LinkVideoModal({ onClose, onSave }: LinkVideoModalProps) {
  const [url, setUrl] = useState('');

  const handleSave = () => {
    if (url.trim()) {
      onSave(url.trim());
      setUrl('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50">
      <div className="bg-gray-900 text-white p-6 rounded-lg w-96 shadow-lg">
        <h2 className="text-lg font-bold mb-4">🔗 Attach Link / Video</h2>

        <input
          type="text"
          placeholder="Paste link here..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full p-2 rounded bg-gray-800 border border-gray-700 mb-4"
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-black rounded"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}