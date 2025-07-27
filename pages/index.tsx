// pages/index.tsx
import React, { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Tooltip } from "react-tooltip";
import ReactFlow, { Background, Controls } from "react-flow-renderer";

import { parseBookWithChapters } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

// Simple glossary
const GLOSSARY: Record<string, string> = {
  photosynthesis: "The process plants use to convert light into energy.",
  mitosis:        "Cell division that results in two daughter cells.",
  // …add more…
};

type UploadStatus = "idle" | "uploading" | "error" | "done";
type FileType     = "none" | "text" | "pdf";

export default function Home() {
  // ─── State ───────────────────────────────────────────────────────────────
  const [inputText, setInputText]       = useState("");
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [error, setError]               = useState<string | null>(null);

  const [fileType, setFileType] = useState<FileType>("none");
  const [pdfFile, setPdfFile]   = useState<Blob | null>(null);
  const [numPages, setNumPages] = useState(0);

  const [thoughtUnits, setThoughtUnits]         = useState<string[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);

  const [bookStructure, setBookStructure] = useState<any>(null);

  const textRef = useRef<HTMLDivElement>(null);

  // ─── Thought-Unit Chunking ─────────────────────────────────────────────
  const createThoughtUnits = useCallback((text: string) => {
    if (!text.trim()) {
      setThoughtUnits([]);
      return;
    }
    const clean = text.replace(/\s+/g, " ").trim();
    const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
    const chunks: string[] = [];
    const MAX = 6;

    sentences.forEach((s) => {
      const words = s.split(/\s+/);
      let chunk: string[] = [];
      words.forEach((w,i) => {
        chunk.push(w);
        if (chunk.length >= MAX || i === words.length - 1) {
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

  // ─── PDF → Text Extraction ─────────────────────────────────────────────
  const extractTextFromPDF = useCallback(async (buf: ArrayBuffer) => {
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    let all = "";
    const P = Math.min(pdf.numPages, 200);
    for (let i = 1; i <= P; i++) {
      const page = await pdf.getPage(i);
      const txt = (await page.getTextContent())
        .items.map((it: any) => it.str)
        .join(" ");
      all += txt + "\n\n";
    }
    return all;
  }, []);

  // ─── Handlers ───────────────────────────────────────────────────────────
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      setUploadStatus("uploading");
      setError(null);

      try {
        let txt = "";
        if (f.type === "application/pdf") {
          setFileType("pdf");
          const buf = await f.arrayBuffer();
          setPdfFile(new Blob([buf], { type: f.type }));
          txt = await extractTextFromPDF(buf);
        } else {
          setFileType("text");
          txt = await f.text();
        }
        if (!txt.trim()) throw new Error("No text found");
        setInputText(txt);
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
      setError("Nothing to parse");
      return;
    }
    setBookStructure(parseBookWithChapters(inputText, "Uploaded Book"));
  }, [inputText]);

  const onWordClick = (idx: number, ev: React.MouseEvent) => {
    setCurrentChunkIndex(idx);
    (ev.currentTarget as HTMLElement).scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  const handleChunkClick = (idx: number) => {
    setCurrentChunkIndex(idx);
    const el = document.querySelector(`[data-chunk="unit-${idx}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  // ─── Concept Map Sub-component ─────────────────────────────────────────
  const ConceptMap = ({ chapters }: { chapters: any[] }) => {
    const nodes = chapters.map((ch,i) => ({
      id: `n${i}`,
      data: { label: ch.title },
      position: { x: (i%3)*200, y: Math.floor(i/3)*120 },
    }));
    const edges = chapters.flatMap((ch,i) =>
      (ch.links||[]).map((t:number) => ({
        id: `e${i}-${t}`, source:`n${i}`, target:`n${t}`
      }))
    );
    return (
      <div style={{ height:300, border:"1px solid #ddd", borderRadius:8 }}>
        <ReactFlow nodes={nodes} edges={edges}>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      {/* ─── Upload + Parse ────────────────────────────────── */}
      <div className="p-4 bg-white shadow flex items-center gap-4">
        <input
          type="file"
          accept=".pdf,.txt"
          onChange={handleFileChange}
          className="border rounded p-1"
        />
        <Button onClick={parseText}>Parse Chapters</Button>
        {uploadStatus === "uploading" && <span>⏳ Loading…</span>}
        {uploadStatus === "error"     && (
          <span className="text-red-600">⚠️ {error}</span>
        )}
      </div>

      {/* ─── Two-col layout ───────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-6 p-6">
        {/* LEFT: PDF viewer or original text */}
        <div className="bg-white p-4 rounded shadow">
          {fileType === "pdf" && pdfFile ? (
            <TransformWrapper>
              <TransformComponent>
                <Document
                  file={pdfFile}
                  onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                >
                  {Array.from({ length: Math.min(numPages,50) }).map((_,i)=>
                    <Page key={i} pageNumber={i+1} scale={1.2} className="mb-4"/>
                  )}
                </Document>
              </TransformComponent>
            </TransformWrapper>
          ) : (
            <div
              ref={textRef}
              className="overflow-y-auto"
              style={{ maxHeight:"80vh", whiteSpace:"pre-wrap" }}
            >
              {inputText.split(/(\s+)/).map((tok,idx) => {
                const clean = tok.replace(/[^a-zA-Z]/g,"").toLowerCase();
                const ui = thoughtUnits.findIndex(u=>
                  u.toLowerCase().split(/\s+/).includes(clean)
                );
                return (
                  <span
                    key={idx}
                    data-tooltip-id={GLOSSARY[clean] ? "glossary" : undefined}
                    data-tooltip-content={GLOSSARY[clean]}
                    data-chunk={ui>=0?`unit-${ui}`:undefined}
                    className={ui===currentChunkIndex?"bg-yellow-200":"hover:bg-yellow-100"}
                    style={{ cursor: ui>=0?"pointer":"inherit" }}
                    onClick={ui>=0?(e)=>onWordClick(ui,e):undefined}
                  >{tok}</span>
                );
              })}
              <Tooltip id="glossary" />
            </div>
          )}
        </div>

        {/* RIGHT: Thought Units + Concept Map */}
        <div className="bg-white p-4 rounded shadow overflow-auto">
          <h2 className="font-bold mb-2">Thought Units</h2>
          <div className="space-y-2 mb-6">
            {thoughtUnits.map((u,i) => (
              <button
                key={i}
                onClick={() => handleChunkClick(i)}
                className={`block w-full text-left p-2 rounded ${i===currentChunkIndex?"bg-blue-100":""}`}
              >
                {u}
              </button>
            ))}
          </div>
          {bookStructure?.chapters && (
            <>
              <h3 className="font-semibold mb-2">Concept Map</h3>
              <ConceptMap chapters={bookStructure.chapters}/>
            </>
          )}
        </div>
      </div>
    </>
  );
}