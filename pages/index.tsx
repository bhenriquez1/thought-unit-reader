// pages/index.tsx - Final Sync with Chapter View, Hybrid View & Coming Soon
import { useState, useEffect, useCallback, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { parseBookWithChapters, generateProgressiveReadingHTML, generateHybridHTML, getChapterByPage } from "../lib/parser";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "none";
type ViewMode = "original" | "chapters" | "progressive" | "hybrid" | "rightbrain";

export default function Home() {
  const [viewMode, setViewMode] = useState<ViewMode>("original");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [chapters, setChapters] = useState<{ title: string; page: number }[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [output, setOutput] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1.5);

  const viewerRef = useRef<HTMLDivElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setStatus("uploading");
    setFile(f);

    if (f.type === "application/pdf") {
      setStatus("done");
    } else {
      const txt = await f.text();
      setText(txt);
      setStatus("processing");
      const { chapters, parsedUnits } = parseBookWithChapters(txt);
      setChapters(chapters);
      setUnits(parsedUnits);
      setStatus("done");
    }
  };

  const handleJumpToPage = (page: number) => setCurrentPage(page);
  const handleZoom = (factor: number) => setZoom((z) => Math.max(0.5, z + factor));

  const renderSidebar = () => (
    <div className="w-64 p-4 border-r overflow-y-auto bg-white dark:bg-zinc-900">
      <h2 className="text-lg font-semibold mb-4">Chapters</h2>
      <input type="file" onChange={handleFileChange} className="mb-4" />
      <Label className="block mb-2">Reading Mode</Label>
      <select
        value={viewMode}
        onChange={(e) => setViewMode(e.target.value as ViewMode)}
        className="mb-4 w-full border px-2 py-1 rounded"
      >
        <option value="original">Original View</option>
        <option value="chapters">Chapter View</option>
        <option value="progressive">Thought Unit</option>
        <option value="hybrid">Hybrid View</option>
        <option value="rightbrain">Right Brain</option>
      </select>
      {chapters.map((ch, idx) => (
        <button
          key={idx}
          className="text-left text-blue-500 hover:underline w-full mb-1"
          onClick={() => handleJumpToPage(ch.page)}
        >
          {ch.title} — Page {ch.page}
        </button>
      ))}
    </div>
  );

  const renderMainContent = () => {
    if (viewMode === "original" || viewMode === "chapters") {
      return (
        <div className="flex-1 p-4 overflow-auto">
          <div className="flex justify-between mb-2">
            <span>Page {currentPage} / {numPages}</span>
            <span>Zoom {Math.round(zoom * 100)}%</span>
          </div>
          <div className="mb-4 flex gap-2">
            <input
              type="number"
              value={currentPage}
              onChange={(e) => setCurrentPage(Number(e.target.value))}
              className="w-20 px-2 border rounded"
            />
            <Button onClick={() => handleJumpToPage(currentPage)}>Go</Button>
          </div>
          <div ref={viewerRef} style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
            <Document file={file!} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
              <Page pageNumber={currentPage} width={800} />
            </Document>
          </div>
        </div>
      );
    }

    if (viewMode === "progressive") {
      return (
        <div className="flex-1 p-4 overflow-auto prose dark:prose-invert">
          <div dangerouslySetInnerHTML={{ __html: generateProgressiveReadingHTML(units) }} />
        </div>
      );
    }

    if (viewMode === "hybrid") {
      return (
        <div className="flex-1 p-4 overflow-auto prose dark:prose-invert">
          <div dangerouslySetInnerHTML={{ __html: generateHybridHTML(chapters, units, currentPage) }} />
        </div>
      );
    }

    if (viewMode === "rightbrain") {
      return (
        <div className="flex-1 p-4 text-center text-xl font-semibold">
          🎧 Right Brain Mode — Coming Soon…
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex h-screen">
      {renderSidebar()}
      {renderMainContent()}
    </div>
  );
}