import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import { useTheme } from 'next-themes';
import { Document, Page, pdfjs } from 'react-pdf';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Tooltip } from 'react-tooltip';
import ReactFlow, { Background, Controls } from 'react-flow-renderer';
import clsx from 'clsx';

import { parseBookWithChapters } from '../lib/parser';
import { Button } from '../components/ui/button';

// PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

// Simple glossary
const GLOSSARY: Record<string, string> = {
  photosynthesis: 'The process plants use to convert light into energy.',
  mitosis: 'Cell division that results in two daughter cells.',
  // …etc
};

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';
type FileType = 'text' | 'pdf' | 'none';

export default function Home() {
  // —— theme
  const { theme, setTheme } = useTheme();

  // —— file/upload state
  const [inputText, setInputText] = useState('');
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fileType, setFileType] = useState<FileType>('none');
  const [pdfFile, setPdfFile] = useState<Blob | null>(null);
  const [numPages, setNumPages] = useState(0);

  // —— thought units
  const [thoughtUnits, setThoughtUnits] = useState<string[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [bookStructure, setBookStructure] = useState<any>(null);

  const textContainerRef = useRef<HTMLDivElement>(null);

  // —— chunker
  const createThoughtUnits = useCallback((text: string) => {
    if (!text) {
      setThoughtUnits([]);
      return;
    }
    const clean = text.replace(/\s+/g, ' ').trim();
    const sents = clean.match(/[^.!?]+[.!?]+/g) || [clean];
    const chunks: string[] = [];
    const maxSize = 6;
    sents.forEach((s) => {
      const words = s.split(/\s+/);
      let pack: string[] = [];
      words.forEach((w, i) => {
        pack.push(w);
        if (pack.length >= maxSize || i === words.length - 1) {
          chunks.push(pack.join(' '));
          pack = [];
        }
      });
    });
    setThoughtUnits(chunks);
  }, []);

  useEffect(() => {
    createThoughtUnits(inputText);
  }, [inputText, createThoughtUnits]);

  // —— pdf text extraction
  const extractTextFromPDF = useCallback(async (buffer: ArrayBuffer) => {
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;
    let txt = '';
    const pages = Math.min(pdf.numPages, 200);
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      txt += content.items.map((it: any) => it.str).join(' ') + '\n';
    }
    return txt;
  }, []);

  // —— file handler
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploadStatus('uploading');
      setError(null);

      try {
        let text = '';
        if (file.type === 'application/pdf') {
          setFileType('pdf');
          const buf = await file.arrayBuffer();
          setPdfFile(new Blob([buf], { type: file.type }));
          text = await extractTextFromPDF(buf);
        } else {
          setFileType('text');
          text = await file.text();
        }
        if (!text.trim()) throw new Error('No text found');
        setInputText(text);
        setUploadStatus('done');
      } catch (err) {
        setError((err as Error).message);
        setUploadStatus('error');
      }
    },
    [extractTextFromPDF]
  );

  // —— parse chapters
  const parseText = useCallback(() => {
    if (!inputText.trim()) {
      setError('Nothing to parse');
      return;
    }
    setBookStructure(parseBookWithChapters(inputText, 'Uploaded Book'));
  }, [inputText]);

  // —— click handlers
  const onWordClick = (idx: number, e: React.MouseEvent) => {
    setCurrentChunkIndex(idx);
    (e.currentTarget as HTMLElement).scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  };
  const handleChunkClick = (idx: number) => {
    setCurrentChunkIndex(idx);
    const span = document.querySelector(`[data-chunk="unit-${idx}"]`);
    if (span instanceof HTMLElement) {
      span.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // —— build TOC offsets
  const chapterOffsets = useMemo(() => {
    if (!bookStructure?.chapters) return [];
    let sum = 0;
    return bookStructure.chapters.map((ch: any) => {
      const start = sum;
      sum += ch.units.length;
      return start;
    });
  }, [bookStructure]);

  // —— ConceptMap sub-component
  const ConceptMap = ({ chapters }: { chapters: any[] }) => {
    const nodes = chapters.map((ch, i) => ({
      id: `n${i}`,
      data: { label: ch.title },
      position: { x: (i % 3) * 200, y: Math.floor(i / 3) * 120 },
    }));
    const edges = chapters.flatMap((ch, i) =>
      (ch.links || []).map((t: number) => ({
        id: `e${i}-${t}`,
        source: `n${i}`,
        target: `n${t}`,
      }))
    );
    return (
      <div className="h-72 border border-gray-200 dark:border-gray-700 rounded-lg">
        <ReactFlow nodes={nodes} edges={edges}>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    );
  };

  return (
    <div
      className={clsx(
        'min-h-screen flex flex-col',
        theme === 'dark'
          ? 'bg-gray-900 text-gray-100'
          : 'bg-gray-100 text-gray-900'
      )}
    >
      {/* ── sticky header ── */}
      <header className="sticky top-0 z-20 border-b border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".pdf,.txt"
              onChange={handleFileChange}
              className="border rounded px-2 py-1 bg-white dark:bg-gray-700"
            />
            <Button onClick={parseText}>Parse Chapters</Button>
            {uploadStatus === 'uploading' && <span>⏳ Loading…</span>}
            {uploadStatus === 'error' && (
              <span className="text-red-500">⚠️ {error}</span>
            )}
          </div>
          <button
            onClick={() =>
              setTheme(theme === 'light' ? 'dark' : 'light')
            }
            className="px-2 py-1 border rounded bg-gray-200 dark:bg-gray-700"
          >
            {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
          </button>
        </div>
      </header>

      {/* ── main grid ── */}
      <main className="flex-1 overflow-hidden max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT PANEL */}
        <section className="flex flex-col h-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
          {/* Electronic TOC */}
          {bookStructure?.chapters && (
            <nav className="px-4 py-2 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <h3 className="text-sm font-semibold">Contents</h3>
              <ul className="mt-2 space-y-1">
                {bookStructure.chapters.map((ch: any, i: number) => (
                  <li key={i}>
                    <button
                      onClick={() => handleChunkClick(chapterOffsets[i])}
                      className="text-left text-sm hover:underline"
                    >
                      {ch.title}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {/* PDF or Text */}
          <div className="flex-1 overflow-y-auto p-4">
            {fileType === 'pdf' && pdfFile ? (
              <TransformWrapper>
                <TransformComponent>
                  <Document
                    file={pdfFile}
                    onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                  >
                    {Array.from({ length: Math.min(numPages, 50) }).map(
                      (_, i) => (
                        <Page
                          key={i}
                          pageNumber={i + 1}
                          scale={1.2}
                          className="mb-6"
                        />
                      )
                    )}
                  </Document>
                </TransformComponent>
              </TransformWrapper>
            ) : (
              <div ref={textContainerRef} className="whitespace-pre-wrap">
                {inputText.split(/(\s+)/).map((tok, idx) => {
                  const clean = tok
                    .replace(/[^a-zA-Z]/g, '')
                    .toLowerCase();
                  const ui = thoughtUnits.findIndex((u) =>
                    u.toLowerCase().split(/\s+/).includes(clean)
                  );
                  return (
                    <span
                      key={idx}
                      data-tooltip-id="glossary"
                      data-tooltip-content={GLOSSARY[clean] || ''}
                      data-chunk={ui >= 0 ? `unit-${ui}` : undefined}
                      className={clsx(
                        'transition-all duration-300 ease-in-out',
                        ui === currentChunkIndex
                          ? 'bg-yellow-200 dark:bg-yellow-600 scale-105 shadow-lg animate-pulse'
                          : 'hover:bg-yellow-100 dark:hover:bg-yellow-700 scale-100'
                      )}
                      style={{
                        cursor: ui >= 0 ? 'pointer' : 'auto',
                      }}
                      onClick={
                        ui >= 0 ? (e) => onWordClick(ui, e) : undefined
                      }
                    >
                      {tok}
                    </span>
                  );
                })}
                <Tooltip id="glossary" />
              </div>
            )}
          </div>
        </section>

        {/* RIGHT PANEL */}
        <section className="flex flex-col h-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
          <header className="px-4 py-3 border-b border-gray-200 dark:border-gray-600">
            <h2 className="font-bold">Thought Units</h2>
          </header>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {thoughtUnits.map((u, i) => (
              <button
                key={i}
                onClick={() => handleChunkClick(i)}
                className={clsx(
                  'w-full text-left p-2 rounded transition-all duration-200',
                  i === currentChunkIndex
                    ? 'bg-blue-100 dark:bg-blue-900'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                )}
              >
                {u}
              </button>
            ))}
          </div>
          {bookStructure?.chapters && (
            <footer className="px-4 py-3 border-t border-gray-200 dark:border-gray-600">
              <h3 className="font-semibold mb-2">Concept Map</h3>
              <ConceptMap chapters={bookStructure.chapters} />
            </footer>
          )}
        </section>
      </main>
    </div>
  );
}