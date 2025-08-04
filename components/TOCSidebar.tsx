// components/TOCSidebar.tsx
import React from 'react';
import { TOCEntry } from '@/lib/tocParser';

interface Props {
  toc: TOCEntry[];
  currentPage: number;
  onJumpToPage: (page: number) => void;
}

export default function TOCSidebar({ toc, currentPage, onJumpToPage }: Props) {
  return (
    <div className="w-64 bg-gray-900 text-white p-4 overflow-y-auto">
      <h3 className="text-lg font-bold mb-4">📑 Table of Contents</h3>
      <input
        type="text"
        placeholder="Search..."
        className="w-full p-2 mb-4 rounded bg-gray-800 text-sm"
      />
      <ul>
        {toc.map((entry, idx) => (
          <li
            key={idx}
            onClick={() => onJumpToPage(entry.page)}
            className={`cursor-pointer p-2 rounded hover:bg-gray-700 ${
              currentPage === entry.page ? 'bg-yellow-500 text-black' : ''
            }`}
          >
            {entry.title}
          </li>
        ))}
      </ul>
    </div>
  );
}