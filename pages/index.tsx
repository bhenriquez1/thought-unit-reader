// pages/index.tsx
import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Tooltip } from "react-tooltip";
import ReactFlow, { Background, Controls } from "react-flow-renderer";

import { parseBookWithChapters } from "../lib/parser";
import { Button } from "../components/ui/button";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType      = "text" | "pdf" | "none";

const GLOSSARY: Record<string, string> = {
  photosynthesis: "The process plants use to convert light into energy.",
  mitosis:         "Cell division that results in two daughter cells.",
  // …add more terms here…
};

export default function Home() {
  // ─── State ─────────────────────────────────────────
  const [inputText, setInputText]                 = useState("");
  const [uploadStatus, setUploadStatus]           = useState<UploadStatus>("idle");
  const [error, setError]                         = useState<string | null>(null);

  const [fileType, setFileType]                   = useState<FileType>("none");
  const [pdfFile, setPdfFile]                     = useState<Blob | null>(null);
  const [numPages, setNumPages]                   = useState(0);

  const [thoughtUnits, setThoughtUnits]           = useState<string[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [bookStructure, setBookStructure]         = useState<any>(null);

  const textContainerRef = useRef<HTMLDivElement>(null);
  const unitsListRef     = useRef<HTMLDivElement>(null);

  // ─── Chunking ─────────────────────────────────────
  const createThoughtUnits = useCallback((text: string) => {
    if (!text) {
      setThoughtUnits([]);
      return;
    }
    const clean     = text.replace(/\s+/g, " ").trim();
    const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
    const chunks: string[] = [];
    const maxSize = 6;

    sentences.forEach(s => {
      const words = s.split(/\s+/);
      let chunk: string[] = [];
      words.forEach((w, i) => {
        chunk.push(w);
        const atMax = chunk.length >= maxSize;
        const last  = i === words.length - 1;
        if (atMax || last) {
          chunks.push(chunk.join(" "));
          chunk = [];
        }
      });
    });

    setThoughtUnits(chunks);
  }, []);

  useEffect(() => {
    createThoughtUnits(inputText);
  }, [inputText, createThoughtUnits]);

  // ─── PDF Extraction ─────────────────────────────────
  const extractTextFromPDF = useCallback(async (buffer: ArrayBuffer) => {
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;
    let txt = "";
    const pages = Math.min(pdf.numPages, 200);
    for (let i = 1; i <= pages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      txt += content.items.map((it: any) => it.str).join(" ") + "\n";
    }
    return txt;
  }, []);

  // ─── Handlers ──────────────────────────────────────
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploadStatus("uploading");
      setError(null);

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

        if (!text.trim()) throw new Error("No text found in file");
        setInputText(text);
        setUploadStatus("done");
      } catch (err) {
        setError((err as Error).message);
        setUploadStatus("error");
      }
    },
    [extractTextFromPDF]
  );

  const parseText = useCallback(() => {
    if (!inputText.trim()) {
      setError("No text to parse");
      return;
    }
    const structure = parseBookWithChapters(inputText, "Uploaded Book");
    setBookStructure(structure);
  }, [inputText]);

  const onWordClick = (unitIdx: number, e: React.MouseEvent) => {
    setCurrentChunkIndex(unitIdx);
    (e.currentTarget as HTMLElement).scrollIntoView({
      behavior: "smooth",
      block:    "center",
    });
  };

  const handleChunkClick = (idx: number) => {
    setCurrentChunkIndex(idx);
    // scroll thought‐units list
    const btn = unitsListRef.current?.querySelector(`[data-unit="${idx}"]`);
    if (btn instanceof HTMLElement) {
      btn.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // scroll original text
    const span = textContainerRef.current?.querySelector(
      `[data-chunk="unit-${idx}"]`
    ) as HTMLElement;
    span?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // ─── Chapter Offsets ───────────────────────────────
  const chapterOffsets = useMemo<number[]>(() => {
    if (!bookStructure?.chapters) return [];
    let off = 0;
    return bookStructure.chapters.map((ch: any) => {
      const start = off;
      off += ch.units.length;
      return start;
    });
  }, [bookStructure]);

  // ─── ConceptMap ────────────────────────────────────
  const ConceptMap = ({ chapters }: { chapters: any[] }) => {
    const nodes = chapters.map((ch, i) => ({
      id:       `n${i}`,
      data:     { label: ch.title },
      position: { x: (i % 3) * 200, y: Math.floor(i / 3) * 120 },
    }));
    const edges = chapters.flatMap((ch, i) =>
      (ch.links || []).map((t: number) => ({
        id:     `e${i}-${t}`,
        source: `n${i}`,
        target: `n${t}`,
      }))
    );
    return (
      <div style={{ height: 300, border: "1px solid #ddd", borderRadius: 8 }}>
        <ReactFlow nodes={nodes} edges={edges}>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    );
  };

  // ─── Render ────────────────────────────────────────
  return (
    <>
      {/* Upload & Parse */}
      <div className="p-4 bg-white shadow flex items-center gap-4">
        <input
          type="file"
          accept=".pdf,.txt"
          onChange={handleFileChange}
          className="border rounded p-1"
        />
        <Button onClick={parseText}>Parse Chapters</Button>
        {uploadStatus === "uploading" && <span>⏳ Loading…</span>}
        {uploadStatus === "error"    && (
          <span className="text-red-600">⚠️ {error}</span>
        )}
      </div>

      {/* Two-column */}
      <div className="grid lg:grid-cols-2 gap-6 p-6">
        {/* LEFT: TOC + PDF/Text */}
        <div className="bg-white p-4 rounded shadow space-y-4">
          {bookStructure?.chapters && (
            <div>
              <h3 className="font-semibold mb-2">Contents</h3>
              <ul className="space-y-1">
                {bookStructure.chapters.map((ch: any, i: number) => (
                  <li key={i}>
                    <button
                      onClick={() => handleChunkClick(chapterOffsets[i])}
                      className="text-left w-full hover:underline"
                    >
                      {ch.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {fileType === "pdf" && pdfFile ? (
            <div className="overflow-auto border rounded" style={{ maxHeight: "70vh" }}>
              <TransformWrapper>
                <TransformComponent>
                  <Document
                    file={pdfFile}
                    onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                    className="w-full"
                  >
                    {Array.from({ length: Math.min(numPages, 50) }).map((_, i) => (
                      <div key={i} data-page={i + 1} className="mb-4">
                        <Page pageNumber={i + 1} scale={1.2} />
                      </div>
                    ))}
                  </Document>
                </TransformComponent>
              </TransformWrapper>
            </div>
          ) : (
            <div
              ref={textContainerRef}
              className="overflow-y-auto border rounded p-4"
              style={{ maxHeight: "70vh", whiteSpace: "pre-wrap" }}
            >
              {inputText.split(/(\s+)/).map((tok, idx) => {
                const clean = tok.replace(/[^a-zA-Z]/g, "").toLowerCase();
                const ui    = thoughtUnits.findIndex(u =>
                  u.toLowerCase().split(/\s+/).includes(clean)
                );
                return (
                  <span
                    key={idx}
                    data-tooltip-id="glossary"
                    data-tooltip-content={GLOSSARY[clean] || ""}
                    data-chunk={ui >= 0 ? `unit-${ui}` : undefined}
                    className={
                      ui === currentChunkIndex
                        ? "bg-yellow-200"
                        : "hover:bg-yellow-100"
                    }
                    style={{ cursor: ui >= 0 ? "pointer" : "inherit" }}
                    onClick={ui >= 0 ? e => onWordClick(ui, e) : undefined}
                  >
                    {tok}
                  </span>
                );
              })}
              <Tooltip id="glossary" />
            </div>
          )}
        </div>

        {/* RIGHT: Units + Map */}
        <div
          ref={unitsListRef}
          className="bg-white p-4 rounded shadow overflow-auto"
          style={{ maxHeight: "80vh" }}
        >
          <h2 className="font-bold mb-2">Thought Units</h2>
          <div className="space-y-2 mb-6">
            {thoughtUnits.map((u, i) => (
              <button
                key={i}
                data-unit={i}
                onClick={() => handleChunkClick(i)}
                className={`block w-full text-left p-2 rounded ${
                  i === currentChunkIndex ? "bg-blue-100" : ""
                }`}
              >
                {u}
              </button>
            ))}
          </div>

          {bookStructure?.chapters && (
            <>
              <h3 className="font-semibold mb-2">Concept Map</h3>
              <ConceptMap chapters={bookStructure.chapters} />
            </>
          )}
        </div>
      </div>
    </>
  );
}