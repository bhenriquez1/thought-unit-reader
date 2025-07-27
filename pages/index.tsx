// pages/index.tsx - Fully updated with Page Search, Clickable Pages, and Bi-directional Sync
import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useTheme } from "next-themes";
import { Document, Page, pdfjs } from "react-pdf";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Tooltip as ReactTooltip } from "react-tooltip";
import ReactFlow, { Background, Controls } from "react-flow-renderer";
import { parseBookWithChapters } from "../lib/parser";
import { Button } from "../components/ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const GLOSSARY: Record<string, string> = {
  photosynthesis: "The process plants use to convert light into energy.",
  mitosis: "Cell division that results in two daughter cells."
};

export default function Home() {
  const { theme, setTheme } = useTheme();
  const [inputText, setInputText] = useState("");
  const [uploadStatus, setUploadStatus] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileType, setFileType] = useState("none");
  const [pdfFile, setPdfFile] = useState<Blob | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfScale, setPdfScale] = useState(1.0);
  const [thoughtUnits, setThoughtUnits] = useState<string[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [bookStructure, setBookStructure] = useState<any>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);

  const createThoughtUnits = useCallback((text: string) => {
    if (!text) return setThoughtUnits([]);
    const clean = text.replace(/\s+/g, " ").trim();
    const sents = clean.match(/[^.!?]+[.!?]+/g) || [clean];
    const chunks: string[] = [];
    const maxSize = 6;
    sents.forEach(s => {
      const words = s.split(/\s+/);
      let pack: string[] = [];
      words.forEach((w, i) => {
        pack.push(w);
        if (pack.length >= maxSize || i === words.length - 1) {
          chunks.push(pack.join(" "));
          pack = [];
        }
      });
    });
    setThoughtUnits(chunks);
  }, []);

  useEffect(() => { createThoughtUnits(inputText); }, [inputText, createThoughtUnits]);

  const extractTextFromPDF = useCallback(async (buffer: ArrayBuffer) => {
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;
    let txt = "";
    const pages = Math.min(pdf.numPages, 200);
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      txt += content.items.map((it: any) => it.str).join(" ") + "\n";
    }
    return txt;
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus("uploading"); setError(null);
    try {
      let text = "";
      if (file.type === "application/pdf") {
        setFileType("pdf");
        const buf = await file.arrayBuffer();
        setPdfFile(new Blob([buf], { type: file.type }));
        text = await extractTextFromPDF(buf);
      } else {
        setFileType("text");
        text = await file.text();
      }
      if (!text.trim()) throw new Error("No text found");
      setInputText(text);
      setUploadStatus("done");
    } catch (err) {
      setError((err as Error).message);
      setUploadStatus("error");
    }
  }, [extractTextFromPDF]);

  const parseText = useCallback(() => {
    if (!inputText.trim()) return setError("Nothing to parse");
    setBookStructure(parseBookWithChapters(inputText, "Uploaded Book"));
  }, [inputText]);

  const unitToPage = useMemo(() => {
    const pageCount = Math.max(1, numPages || 1);
    const mapping: Record<number, number> = {};
    const unitsPerPage = Math.ceil(thoughtUnits.length / pageCount);
    thoughtUnits.forEach((_, idx) => {
      mapping[idx] = Math.floor(idx / unitsPerPage) + 1;
    });
    return mapping;
  }, [thoughtUnits, numPages]);

  const onWordClick = (idx: number, e: React.MouseEvent) => {
    setCurrentChunkIndex(idx);
    const pageNum = unitToPage[idx];
    document.querySelector(`#page-${pageNum}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    (e.currentTarget as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleChunkClick = (idx: number) => {
    setCurrentChunkIndex(idx);
    const pageNum = unitToPage[idx];
    document.querySelector(`#page-${pageNum}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className={`min-h-screen flex flex-col ${theme === "dark" ? "bg-gray-900 text-gray-100" : "bg-gray-100 text-gray-900"}`}>
      <header className="sticky top-0 z-20 border-b border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Thought Unit Reader</h1>
            <input type="file" accept=".pdf,.txt" onChange={handleFileChange} className="border rounded px-2 py-1 bg-white dark:bg-gray-700" />
            <Button onClick={parseText}>Parse Chapters</Button>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number" min="1" max={numPages}
              placeholder="Page #"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const n = Number((e.target as HTMLInputElement).value);
                  document.querySelector(`#page-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }
              }}
              className="w-16 px-2 py-1 border rounded bg-white dark:bg-gray-700 text-sm"
            />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="flex flex-col bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="flex-1 overflow-auto p-4" ref={textContainerRef}>
            {fileType === "pdf" && pdfFile ? (
              <TransformWrapper wheel={{ step: 50 }} initialScale={pdfScale}>
                <TransformComponent>
                  <Document file={pdfFile} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
                    {Array.from({ length: Math.min(numPages, 50) }).map((_, i) => (
                      <div key={i} id={`page-${i + 1}`} onClick={() => setCurrentChunkIndex(i)} className="cursor-pointer">
                        <Page pageNumber={i + 1} scale={pdfScale} className="mb-6" />
                      </div>
                    ))}
                  </Document>
                </TransformComponent>
              </TransformWrapper>
            ) : (
              <div className="whitespace-pre-wrap">
                {inputText.split(/(\s+)/).map((tok, idx) => {
                  const clean = tok.replace(/[^a-zA-Z]/g, "").toLowerCase();
                  const ui = thoughtUnits.findIndex(u => u.toLowerCase().split(/\s+/).includes(clean));
                  return (
                    <span
                      key={idx}
                      data-tooltip-id="glossary"
                      data-tooltip-content={GLOSSARY[clean] || ""}
                      data-chunk={ui >= 0 ? `unit-${ui}` : undefined}
                      className={`inline-block transition-all duration-300 ease-in-out ${ui === currentChunkIndex ? "bg-yellow-200 dark:bg-yellow-600 scale-105 shadow-lg animate-pulse" : "hover:bg-yellow-100 dark:hover:bg-yellow-700 scale-100"}`}
                      style={{ cursor: ui >= 0 ? "pointer" : "auto" }}
                      onClick={ui >= 0 ? (e) => onWordClick(ui, e) : undefined}
                    >
                      {tok}
                    </span>
                  );
                })}
                <ReactTooltip id="glossary" />
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
          <header className="px-4 py-3 border-b border-gray-200 dark:border-gray-600">
            <h2 className="font-bold">Thought Units</h2>
          </header>
          <div className="flex-1 overflow-auto p-4 space-y-2">
            {thoughtUnits.map((u, i) => (
              <button
                key={i}
                onClick={() => handleChunkClick(i)}
                className={`w-full text-left p-2 rounded transition ${i === currentChunkIndex ? "bg-blue-100 dark:bg-blue-900" : "hover:bg-gray-50 dark:hover:bg-gray-700"}`}
              >
                {u}
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}