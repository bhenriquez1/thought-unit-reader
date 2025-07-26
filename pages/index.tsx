import React, { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import ReactTooltip from "react-tooltip";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import ReactFlow, { Background, Controls } from "react-flow-renderer";

import { parseBookWithChapters } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc =
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "none";
type ViewMode = "original" | "chapters" | "progressive" | "hybrid";

// Simple glossary lookup
const GLOSSARY: Record<string, string> = {
  photosynthesis: "The process plants use to convert light into energy.",
  mitosis: "Cell division that results in two daughter cells.",
  // add more entries here
};

export default function Home() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("hybrid");
  const [bookStructure, setBookStructure] = useState<any>(null);

  // PDF states
  const [fileType, setFileType] = useState<FileType>("none");
  const [pdfFile, setPdfFile] = useState<Blob | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [fileName, setFileName] = useState("");
  const [pdfScale, setPdfScale] = useState(1.0);

  // Reading states
  const [thoughtUnits, setThoughtUnits] = useState<string[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);

  // Ref for original text container
  const textContainerRef = useRef<HTMLDivElement>(null);

  // Chunker
  const createThoughtUnits = useCallback((text: string) => {
    if (!text) { setThoughtUnits([]); return; }
    const clean = text.replace(/\s+/g, ' ').trim();
    const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
    const chunks: string[] = [];
    const maxSize = 6;
    sentences.forEach(s => {
      const words = s.split(/\s+/);
      let chunk: string[] = [];
      words.forEach((w, i) => {
        chunk.push(w);
        const atMax = chunk.length >= maxSize;
        const last = i === words.length - 1;
        if (atMax || last) {
          chunks.push(chunk.join(' '));
          chunk = [];
        }
      });
    });
    setThoughtUnits(chunks);
  }, []);

  useEffect(() => {
    createThoughtUnits(inputText);
  }, [inputText, createThoughtUnits]);

  // PDF text extractor
  const extractTextFromPDF = useCallback(async (buffer: ArrayBuffer) => {
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;
    let txt = "";
    const pages = Math.min(pdf.numPages, 200);
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      txt += content.items.map((it: any) => it.str).join(' ') + '\n';
    }
    return txt;
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus("uploading"); setFileName(file.name);
    try {
      let text = "";
      if (file.type === 'application/pdf') {
        setFileType('pdf');
        const buf = await file.arrayBuffer();
        setPdfFile(new Blob([buf],{ type: file.type }));
        text = await extractTextFromPDF(buf);
      } else {
        setFileType('text');
        text = await file.text();
      }
      if (!text.trim()) throw new Error('No text');
      setInputText(text);
      setUploadStatus('done');
    } catch (err) {
      setError((err as Error).message); setUploadStatus('error');
    }
  }, [extractTextFromPDF]);

  const parseText = useCallback(() => {
    if (!inputText.trim()) return setError('No input');
    setBookStructure(parseBookWithChapters(inputText, fileName));
    setViewMode('hybrid');
  }, [inputText, fileName]);

  // When user clicks a text-span
  const onWordClick = (unitIdx: number, event: React.MouseEvent) => {
    setCurrentChunkIndex(unitIdx);
    const span = event.currentTarget as HTMLElement;
    span.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  // Updated click on chunk button
  const handleChunkClick = (idx: number) => {
    setCurrentChunkIndex(idx);
    const span = document.querySelector(`[data-chunk="unit-${idx}"]`);
    if (span instanceof HTMLElement) span.scrollIntoView({ block:'center' });
  };

  // ConceptMap component
  const ConceptMap = ({ chapters }: { chapters: any[] }) => {
    const nodes = chapters.map((ch,i) => ({ id:`n${i}`, data:{ label: ch.title }, position:{ x:(i%3)*200, y: Math.floor(i/3)*120 }}));
    const edges = chapters.flatMap((ch,i) => (ch.links||[]).map((t:number)=>({ id:`e${i}-${t}`, source:`n${i}`, target:`n${t}`})));
    return (
      <div style={{ height:300, border:'1px solid #ddd', borderRadius:8 }}>
        <ReactFlow nodes={nodes} edges={edges}>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* header + controls omitted for brevity */}

      <div className="grid lg:grid-cols-2 gap-6 p-6">
        {/* LEFT PANEL */}
        <div className="bg-white p-4 rounded shadow">
          {fileType==='pdf' && pdfFile ? (
            <TransformWrapper>
              <TransformComponent>
                <Document file={pdfFile} onLoadSuccess={({ numPages })=>setNumPages(numPages)}>
                  {Array.from({length: Math.min(numPages,50)}).map((_,i)=>(
                    <Page key={i} pageNumber={i+1} scale={pdfScale} />
                  ))}
                </Document>
              </TransformComponent>
            </TransformWrapper>
          ) : (
            <div ref={textContainerRef} className="overflow-y-auto" style={{ maxHeight: '80vh', whiteSpace:'pre-wrap' }}>
              {inputText.split(/(\s+)/).map((tok, idx)=>{
                const clean = tok.replace(/[^a-zA-Z]/g,'').toLowerCase();
                const ui = thoughtUnits.findIndex(u=>u.toLowerCase().split(/\s+/).includes(clean));
                return (
                  <span
                    key={idx}
                    data-tip={GLOSSARY[clean]}
                    data-for="glossary"
                    data-chunk={ui>=0?`unit-${ui}`:undefined}
                    className={ui===currentChunkIndex? 'bg-yellow-200': 'hover:bg-yellow-100'}
                    style={{ cursor: ui>=0?'pointer':'inherit' }}
                    onClick={ui>=0?e=>onWordClick(ui,e):undefined}
                  >{tok}</span>
                )
              })}
              <ReactTooltip id="glossary" effect="solid" />
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div className="bg-white p-4 rounded shadow overflow-auto">
          <h2 className="font-bold mb-2">Thought Units</h2>
          <div className="space-y-2 mb-6">
            {thoughtUnits.map((u,i)=>(
              <button key={i} onClick={()=>handleChunkClick(i)} className={`block w-full text-left p-2 rounded ${i===currentChunkIndex?'bg-blue-100':''}`}>
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