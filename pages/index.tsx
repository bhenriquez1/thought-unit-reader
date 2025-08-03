// pages/index.tsx
import React, { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Upload } from 'lucide-react';

// Dynamic imports
const SmartPDFViewer = dynamic(() => import('@/components/SmartPDFViewer'), {
  ssr: false,
  loading: () => <div className="p-4 text-center">Loading PDF viewer...</div>,
});
const ProgressiveView = dynamic(() => import('@/components/ProgressiveView'), {
  ssr: false,
  loading: () => <div className="p-4 text-center">Loading Progressive View...</div>,
});
const HybridReader = dynamic(() => import('@/components/HybridReader'), {
  ssr: false,
  loading: () => <div className="p-4 text-center">Loading Hybrid Reader...</div>,
});

export default function Home() {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string>('');
  const [viewMode, setViewMode] = useState<'pdf' | 'progressive' | 'hybrid'>('progressive');

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type === 'application/pdf') {
      setFileUrl(URL.createObjectURL(file));
    } else if (file.type.startsWith('text/')) {
      const txt = await file.text();
      setTextContent(txt);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="text-center py-6 border-b border-gray-700">
        <h1 className="text-3xl font-bold">Thought-Unit Reader</h1>
        <p className="text-gray-400 mt-1">Read deeper, faster, and smarter.</p>
      </header>

      <div className="max-w-5xl mx-auto p-4 space-y-6">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center space-x-2 bg-pink-500 hover:bg-pink-600 px-4 py-2 rounded-lg cursor-pointer">
            <Upload size={16} />
            <span>Upload Book</span>
            <input
              type="file"
              onChange={handleFileUpload}
              className="hidden"
              accept=".pdf,.txt"
            />
          </label>

          <div className="flex space-x-2">
            <button
              onClick={() => setViewMode('pdf')}
              className={`px-4 py-2 rounded-lg ${viewMode === 'pdf' ? 'bg-pink-500' : 'bg-gray-700'}`}
            >
              PDF
            </button>
            <button
              onClick={() => setViewMode('progressive')}
              className={`px-4 py-2 rounded-lg ${viewMode === 'progressive' ? 'bg-pink-500' : 'bg-gray-700'}`}
            >
              Progressive
            </button>
            <button
              onClick={() => setViewMode('hybrid')}
              className={`px-4 py-2 rounded-lg ${viewMode === 'hybrid' ? 'bg-pink-500' : 'bg-gray-700'}`}
            >
              Hybrid
            </button>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg overflow-hidden min-h-[60vh]">
          {viewMode === 'pdf' && fileUrl && (
            <SmartPDFViewer fileUrl={fileUrl} showTextOverlay={false} currentPage={1} />
          )}
          {viewMode === 'progressive' && (
            <ProgressiveView fileUrl={fileUrl} textContent={textContent} />
          )}
          {viewMode === 'hybrid' && (
            <HybridReader fileUrl={fileUrl} textContent={textContent} />
          )}
          {!fileUrl && viewMode === 'pdf' && (
            <div className="p-6 text-center text-gray-300">Upload a PDF to view it here.</div>
          )}
        </div>
      </div>
    </div>
  );
}