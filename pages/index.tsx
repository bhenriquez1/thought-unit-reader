// pages/index.tsx
import React, { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Tooltip } from "react-tooltip";
import "react-tooltip/dist/react-tooltip.css";
import ReactFlow, { Background, Controls } from "react-flow-renderer";

import { parseBookWithChapters } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";

// pdf.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "none";

// A minimal glossary lookup
const GLOSSARY: Record<string, string> = {
  photosynthesis: "The process plants use to convert light into energy.",
  mitosis: "Cell division that results in two daughter cells.",
  // …add your own terms
};

export default function Home() {
  // --- STATE ---
  const [inputText, setInputText] = useState("");
  const [fileType, setFileType] = useState<FileType>("none");
  const [pdfFile, setPdfFile] = useState<Blob | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfScale, setPdfScale] = useState(1.0);

  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const [thoughtUnits, setThoughtUnits] = useState<string[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);

  const [bookStructure, setBookStructure] = useState<any>(null);

  const textContainerRef = useRef<HTMLDivElement>(null);

  // --- EXTRACT TEXT FROM PDF ---
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

  // --- HANDLE FILE UPLOAD ---
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
        if (!text.trim()) throw new Error("No text found");
        setInputText(text);
        setUploadStatus("done");
      } catch (err) {
        setError((err as Error).message);
        setUploadStatus("error");
      }
    },
    [extractTextFromPDF]
  );

  // --- SPLIT INTO THOUGHT UNITS ---
  const createThoughtUnits = useCallback((text: string) => {
    if (!text) return setThoughtUnits([]);
    const clean = text.replace(/\s+/g, " ").trim();
    const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
    const chunks: string[] = [];
    const maxSize = 6;
    sentences.forEach((s) => {
      const words = s.split(/\s+/);
      let chunk: string[] = [];
      words.forEach((w, i) => {
        chunk.push(w);
        const atMax = chunk.length >= maxSize;
        const last = i === words.length - 1;
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

  // --- PARSE INTO CHAPTERS ---
  const parseText = useCallback(() => {
    if (!inputText.trim()) return setError("Please upload or paste text first");
    const structure = parseBookWithChapters(inputText, "Uploaded Book");
    setBookStructure(structure);
  }, [inputText]);

  // --- CLICK ON A WORD IN ORIGINAL TEXT ---
  const onWordClick = (unitIdx: number, e: React.MouseEvent) => {
    setCurrentChunkIndex(unitIdx);
    const span = e.currentTarget as HTMLElement;
    span.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // --- CLICK ON A THOUGHT-UNIT BUTTON ---
  const handleChunkClick = (idx: number) => {
    setCurrentChunkIndex(idx);
    const sel = document.querySelector(`[data-chunk="unit-${idx}"]`);
    if (sel instanceof HTMLElement) {
      sel.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  // --- Concept Map via ReactFlow ---
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
      <div style={{ height: 300, border: "1px solid #ddd", borderRadius: 8 }}>
        <ReactFlow nodes={nodes} edges={edges}>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER & ACTIONS */}
      <div className="p-4 bg-white shadow flex items-center gap-4">
        <Label>Upload PDF or TXT:</Label>
        <input
          type="file"
          accept=".pdf,.txt"
          onChange={handleFileChange}
          className="border rounded p-1"
        />
        <Button onClick={parseText}>Parse Chapters</Button>
        {uploadStatus === "uploading" && <span>⏳ Loading...</span>}
        {uploadStatus === "error" && <span className="text-red-600">⚠ {error}</span>}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 p-6">
        {/* LEFT PANEL: ORIGINAL/PDF */}
        <div className="bg-white p-4 rounded shadow">
          {fileType === "pdf" && pdfFile ? (
            <TransformWrapper>
              <TransformComponent>
                <Document
                  file={pdfFile}
                  onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                >
                  {Array.from({ length: Math.min(numPages, 50) }).map((_, i) => (
                    <div key={i} className="mb-4">
                      <div className="flex justify-between items-center mb-1">
                        <strong>Page {i + 1}</strong>
                        <button
                          className="text-sm text-blue-600 hover:underline"
                          onClick={() => handleChunkClick(Math.floor((i / numPages) * thoughtUnits.length))}
                        >
                          Go to Units
                        </button>
                      </div>
                      <Page
                        pageNumber={i + 1}
                        scale={pdfScale}
                        renderAnnotationLayer={false}
                        renderTextLayer={true}
                      />
                    </div>
                  ))}
                  {numPages > 50 && (
                    <p className="text-center text-gray-500">
                      …and {numPages - 50} more pages
                    </p>
                  )}
                </Document>
              </TransformComponent>
            </TransformWrapper>
          ) : (
            <div
              ref={textContainerRef}
              className="overflow-y-auto"
              style={{ maxHeight: "80vh", whiteSpace: "pre-wrap" }}
            >
              {inputText.split(/(\s+)/).map((tok, idx) => {
                const clean = tok.replace(/[^a-zA-Z]/g, "").toLowerCase();
                const unitIdx = thoughtUnits.findIndex((u) =>
                  u.toLowerCase().split(/\s+/).includes(clean)
                );
                return (
                  <span
                    key={idx}
                    data-tooltip-id="glossary"
                    data-tooltip-content={GLOSSARY[clean] || ""}
                    data-chunk={unitIdx >= 0 ? `unit-${unitIdx}` : undefined}
                    className={
                      unitIdx === currentChunkIndex
                        ? "bg-yellow-200"
                        : unitIdx >= 0
                        ? "hover:bg-yellow-100 cursor-pointer"
                        : ""
                    }
                    onClick={unitIdx >= 0 ? (e) => onWordClick(unitIdx, e) : undefined}
                  >
                    {tok}
                  </span>
                );
              })}
              <Tooltip id="glossary" />
            </div>
          )}
        </div>

        {/* RIGHT PANEL: THOUGHT UNITS + CONCEPT MAP */}
        <div className="bg-white p-4 rounded shadow overflow-auto">
          <h2 className="font-bold mb-2">Thought Units</h2>
          <div className="space-y-2 mb-6 max-h-64 overflow-auto">
            {thoughtUnits.map((u, i) => (
              <button
                key={i}
                onClick={() => handleChunkClick(i)}
                className={`block w-full text-left p-2 rounded ${
                  i === currentChunkIndex ? "bg-blue-100" : ""
                }`}
              >
                {u}
              </button>
            ))}
          </div>

          {bookStructure?.chapters?.length > 0 && (
            <>
              <h3 className="font-semibold mb-2">Table of Contents</h3>
              <ul className="list-disc pl-5 mb-6">
                {bookStructure.chapters.map((ch: any, idx: number) => (
                  <li key={ch.id}>
                    <button
                      className="text-blue-600 hover:underline"
                      onClick={() => handleChunkClick(ch.units[0].globalIndex)}
                    >
                      {ch.number}. {ch.title}
                    </button>
                  </li>
                ))}
              </ul>

              <h3 className="font-semibold mb-2">Concept Map</h3>
              <ConceptMap chapters={bookStructure.chapters} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}