// 🧠 Thought-Unit Reader — DOCX + OCR + Real Chapter Parsing
'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Document, Page, pdfjs, type PDFDocumentProxy } from 'react-pdf';
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import mammoth from 'mammoth';
import Tesseract from 'tesseract.js';

export default function Reader() {
  const { theme, setTheme } = useTheme();
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfScale, setPdfScale] = useState(1.0);
  const zoomRef = useRef<HTMLDivElement | null>(null);
  const [inputText, setInputText] = useState('');
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const [thoughtUnits, setThoughtUnits] = useState<string[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [toc, setToc] = useState<{ title: string; page: number }[]>([]);

  const handleZoom = (scaleDelta: number) => {
    const newScale = Math.min(3.0, Math.max(0.5, pdfScale + scaleDelta));
    setPdfScale(newScale);
  };

  const handleWordClick = useCallback(() => {
    if (!textAreaRef.current || thoughtUnits.length === 0) return;
    const cursor = textAreaRef.current.selectionStart;
    const word = inputText.substring(cursor).split(/\s+/)[0].toLowerCase();
    const matchIndex = thoughtUnits.findIndex(tu => tu.toLowerCase().includes(word));
    if (matchIndex !== -1 && matchIndex !== currentChunkIndex) {
      setCurrentChunkIndex(matchIndex);
    }
  }, [inputText, thoughtUnits, currentChunkIndex]);

  const onDocumentLoadSuccess = (pdf: PDFDocumentProxy) => {
    setNumPages(pdf.numPages);
    setPageNumber(1);
    extractChapters(inputText);
  };

  const extractChapters = (text: string) => {
    const chapterRegex = /(Chapter|CHAPTER)?\s?(\d+|[IVXLC]+)[\.:\-\s]+([A-Z][A-Za-z\s\-\(\)]+)(?=\n|$)/gm;
    const matches = [...text.matchAll(chapterRegex)];
    const found: { title: string; page: number }[] = [];
    matches.forEach((m, i) => {
      found.push({ title: `Chapter ${m[2]}: ${m[3]}`, page: i + 1 });
    });
    setToc(found.length > 0 ? found : Array.from({ length: numPages ?? 0 }, (_, i) => ({ title: `Page ${i + 1}`, page: i + 1 })));
  };

  const handleFileUpload = async (file: File) => {
    const type = file.type;
    if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const arrayBuffer = await file.arrayBuffer();
      const { value } = await mammoth.convertToHtml({ arrayBuffer });
      setInputText(value);
      extractChapters(value);
    } else if (type.startsWith('image/') || type === 'application/pdf') {
      const result = await Tesseract.recognize(file, 'eng');
      setInputText(result.data.text);
      extractChapters(result.data.text);
    } else {
      setPdfFile(file);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col">
      <div className="flex justify-between items-center p-4 border-b">
        <input type="file" accept=".pdf,.docx,.png,.jpg" onChange={e => e.target.files && handleFileUpload(e.target.files[0])} />
        <div className="space-x-2">
          <button onClick={() => handleZoom(-0.1)}>-</button>
          <button onClick={() => handleZoom(+0.1)}>+</button>
        </div>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="px-3 py-1 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
        >
          {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>

      <div className="flex overflow-x-auto gap-2 px-4 py-2 border-b">
        {toc.map((item) => (
          <button
            key={item.page}
            onClick={() => setPageNumber(item.page)}
            className="text-xs px-2 py-1 border rounded hover:bg-gray-200"
          >
            {item.title}
          </button>
        ))}
      </div>

      <div ref={zoomRef} className="flex-1 overflow-auto">
        {pdfFile && (
          <Document file={pdfFile} onLoadSuccess={onDocumentLoadSuccess}>
            <Page pageNumber={pageNumber} scale={pdfScale} />
          </Document>
        )}
      </div>

      <textarea
        ref={textAreaRef}
        onClick={handleWordClick}
        onMouseUp={handleWordClick}
        className="w-full h-32 border-t p-4 font-mono"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder="Click a word to jump to the matching thought-unit"
      />
    </div>
  );
}