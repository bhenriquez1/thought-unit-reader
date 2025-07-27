// pages/index.tsx
import React, { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import ReactTooltip from "react-tooltip";
import ReactFlow, { Background, Controls } from "react-flow-renderer";

import { parseBookWithChapters } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "none";

const GLOSSARY: Record<string,string> = {
  photosynthesis: "The process plants use to convert light into energy.",
  mitosis: "Cell division that results in two daughter cells.",
  // …add more terms here…
};

export default function Home() {
  const [inputText, setInputText] = useState("");
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string|null>(null);
  const [fileType, setFileType] = useState<FileType>("none");
  const [pdfFile, setPdfFile] = useState<Blob|null>(null);
  const [numPages, setNumPages] = useState(0);
  const [fileName, setFileName] = useState("");
  const [pdfScale, setPdfScale] = useState(1.0);

  const [thoughtUnits, setThoughtUnits] = useState<string[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [bookStructure, setBookStructure] = useState<any>(null);

  const textContainerRef = useRef<HTMLDivElement>(null);

  // chunk text into “thought‐units”
  const createThoughtUnits = useCallback((text: string) => {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) { setThoughtUnits([]); return; }
    const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
    const chunks: string[] = [];
    const maxSize = 6;
    for (const s of sentences) {
      const words = s.split(/\s+/);
      let chunk: string[] = [];
      words.forEach((w, i) => {
        chunk.push(w);
        if (chunk.length >= maxSize || i === words.length - 1) {
          chunks.push(chunk.join(" "));
          chunk = [];
        }
      });
    }
    setThoughtUnits(chunks);
  }, []);

  // regenerate on text change
  useEffect(() => {
    createThoughtUnits(inputText);
  }, [inputText, createThoughtUnits]);

  // extract plain text from PDF
  const extractTextFromPDF = useCallback(async (buffer: ArrayBuffer) => {
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;
    let txt = "";
    const pages = Math.min(pdf.numPages, 200);
    for (let i = 1; i <= pages; i++) {
      const pg = await pdf.getPage(i);
      const content = await pg.getTextContent();
      txt += content.items.map((it: any) => it.str).join(" ") + "\n\n";
    }
    return txt;
  }, []);

  // handle upload
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadStatus("uploading");
    setFileName(f.name);
    try {
      let text = "";
      if (f.type === "application/pdf") {
        setFileType("pdf");
        const buf = await f.arrayBuffer();
        setPdfFile(new Blob([buf], { type: "application/pdf" }));
        text = await extractTextFromPDF(buf);
      } else {
        setFileType("text");
        text = await f.text();
      }
      if (!text.trim()) throw new Error("No text found");
      setInputText(text);
      setUploadStatus("done");
    } catch (err: any) {
      setError(err.message);
      setUploadStatus("error");
    }
  }, [extractTextFromPDF]);

  // parse into chapters + thought‐units
  const parseText = useCallback(() => {
    if (!inputText.trim()) return setError("No content to parse");
    setBookStructure(parseBookWithChapters(inputText, fileName));
  }, [inputText, fileName]);

  // click on a word/span => scroll that unit into view
  const onWordClick = (unitIdx: number, e: React.MouseEvent) => {
    setCurrentChunkIndex(unitIdx);
    const el = document.querySelector(`[data-chunk="unit-${unitIdx}"]`);
    if (el instanceof HTMLElement) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // click on thought‐unit button
  const handleChunkClick = (idx: number) => {
    setCurrentChunkIndex(idx);
    const el = document.querySelector(`[data-chunk="unit-${idx}"]`);
    if (el instanceof HTMLElement) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // render the concept‐map
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
      {/* Header / controls */}
      <div className="p-4 bg-white shadow flex gap-4 items-center">
        <input type="file" accept=".pdf,.txt" onChange={handleFileChange} />
        <Button onClick={parseText} disabled={!inputText.trim()}>Parse Text</Button>
        {uploadStatus !== "idle" && <span>{uploadStatus}</span>}
        {error && <span className="text-red-600">{error}</span>}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 p-6">
        {/* LEFT: Original / PDF */}
        <div className="bg-white p-4 rounded shadow">
          {fileType === "pdf" && pdfFile ? (
            <TransformWrapper>
              <TransformComponent>
                <Document
                  file={pdfFile}
                  onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                >
                  {Array.from({ length: Math.min(numPages, 50) }).map((_, i) => (
                    <Page key={i} pageNumber={i + 1} scale={pdfScale} />
                  ))}
                </Document>
              </TransformComponent>
            </TransformWrapper>
          ) : (
            <div
              ref={textContainerRef}
              className="overflow-y-auto max-h-[80vh] whitespace-pre-wrap"
            >
              {inputText.split(/(\s+)/).map((tok, i) => {
                const word = tok.replace(/[^a-zA-Z]/g, "").toLowerCase();
                const unitIdx = thoughtUnits.findIndex((u) =>
                  u.toLowerCase().split(/\s+/).includes(word)
                );
                return (
                  <span
                    key={i}
                    data-tip={GLOSSARY[word]}
                    data-for="glossary"
                    data-chunk={unitIdx >= 0 ? `unit-${unitIdx}` : undefined}
                    className={unitIdx === currentChunkIndex ? "bg-yellow-200" : unitIdx >= 0 ? "hover:bg-yellow-100 cursor-pointer" : ""}
                    onClick={unitIdx >= 0 ? (e) => onWordClick(unitIdx, e) : undefined}
                  >
                    {tok}
                  </span>
                );
              })}
              <ReactTooltip id="glossary" effect="solid" />
            </div>
          )}
        </div>

        {/* RIGHT: Thought‐Units + Concept Map */}
        <div className="bg-white p-4 rounded shadow overflow-auto">
          <h2 className="font-bold mb-2">Thought Units</h2>
          <div className="space-y-2 mb-6">
            {thoughtUnits.map((u, i) => (
              <button
                key={i}
                onClick={() => handleChunkClick(i)}
                className={`block w-full text-left p-2 rounded ${i === currentChunkIndex ? "bg-blue-100" : "hover:bg-gray-100"}`}
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
    </div>
  );
}