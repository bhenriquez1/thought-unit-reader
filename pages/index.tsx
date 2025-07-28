// pages/index.tsx - AI Parsing + File Upload + Autosave + Sticky Notes + Enhanced Hybrid View
import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { parseBookWithChapters, generateProgressiveReadingHTML } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import { useDropzone } from "react-dropzone";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "none";
type ViewMode = "original" | "chapters" | "progressive" | "hybrid";

type StickyNote = { unitIndex: number; content: string };

declare global {
  interface Window {
    handleExplain?: (unitIndex: number) => void;
    handleSticky?: (unitIndex: number) => void;
  }
}

export default function Home() {
  const [enabled, setEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("progressive");
  const [chapters, setChapters] = useState<string[]>([]);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [fileType, setFileType] = useState<FileType>("none");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileData, setFileData] = useState<File | null>(null);
  const [stickyNotes, setStickyNotes] = useState<StickyNote[]>([]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    const savedFile = localStorage.getItem("lastFileName");
    const savedPage = localStorage.getItem("lastPageNumber");
    const savedMode = localStorage.getItem("lastViewMode");
    if (savedFile) setFileName(savedFile);
    if (savedPage) setSelectedPage(parseInt(savedPage));
    if (savedMode) setViewMode(savedMode as ViewMode);
  }, []);

  useEffect(() => {
    if (fileName) localStorage.setItem("lastFileName", fileName);
    localStorage.setItem("lastPageNumber", String(selectedPage));
    localStorage.setItem("lastViewMode", viewMode);
  }, [fileName, selectedPage, viewMode]);

  useEffect(() => {
    window.handleExplain = (unitIndex: number) => {
      alert(`🧠 Explain triggered for unit #${unitIndex + 1}\n\n(This will eventually show an AI explanation)`);
    };

    window.handleSticky = (unitIndex: number) => {
      const content = prompt(`Enter your sticky note for unit #${unitIndex + 1}`);
      if (content) {
        setStickyNotes((prev) => [...prev, { unitIndex, content }]);
      }
    };
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setFileData(file);
    setFileName(file.name);

    if (file.type.includes("pdf")) {
      setFileType("pdf");
      setUploadStatus("done");
      setOutput(null);
      setChapters([]);
      return;
    }

    setUploadStatus("uploading");
    const reader = new FileReader();
    reader.onload = async () => {
      const text = reader.result?.toString() || "";
      setInputText(text);
      setUploadStatus("processing");
      const { chapters, parsed } = await parseBookWithChapters(text);
      setOutput(generateProgressiveReadingHTML(parsed));
      setChapters(chapters);
      setUploadStatus("done");
      setFileType("text");
    };
    reader.readAsText(file);
  }, []);

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  const handleZoomIn = () => setZoom((z) => z + 0.1);
  const handleZoomOut = () => setZoom((z) => Math.max(0.5, z - 0.1));

  return (
    <div className="flex min-h-screen dark:bg-black">
      <aside className="w-64 border-r p-4 space-y-4 dark:bg-zinc-900">
        <h2 className="text-xl font-semibold">📚 Chapters</h2>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {chapters.map((ch, i) => (
            <Button key={i} variant="ghost" className="w-full justify-start text-left" onClick={() => setSelectedPage(i + 1)}>
              {ch}
            </Button>
          ))}
        </div>
        <div className="mt-6">
          <Label className="mb-2 block">🌓 Dark Mode</Label>
          <Switch checked={darkMode} onCheckedChange={setDarkMode} />
        </div>
        <div className="mt-6">
          <Label className="mb-2 block">🗂️ Reading Mode</Label>
          <select className="w-full rounded p-1 bg-zinc-100 dark:bg-zinc-800" value={viewMode} onChange={(e) => setViewMode(e.target.value as ViewMode)}>
            <option value="original">Original View</option>
            <option value="chapters">Chapter View</option>
            <option value="progressive">Right Brain View</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>
        <div className="mt-6">
          <Label className="mb-2 block">📤 Upload a File</Label>
          <div {...getRootProps({ className: "border p-4 cursor-pointer bg-white dark:bg-zinc-800" })}>
            <input {...getInputProps()} />
            {fileName ? fileName : "Click to select or drag and drop a file"}
          </div>
        </div>
      </aside>

      <main className="flex-1 p-4">
        <div className="flex justify-between items-center mb-2">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">🧠 Thought Unit Reader</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Transform any book into thought-units for enhanced comprehension</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setSelectedPage((p) => Math.max(p - 1, 1))}>←</Button>
            <Button onClick={() => setSelectedPage((p) => p + 1)}>→</Button>
            <Button onClick={handleZoomIn}>Zoom In</Button>
            <Button onClick={handleZoomOut}>Zoom Out</Button>
          </div>
        </div>

        {uploadStatus === "done" && fileType === "pdf" && fileData && (
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
            <Document file={fileData} onLoadError={(err) => console.error(err)}>
              <Page pageNumber={selectedPage} />
            </Document>
          </div>
        )}

        {uploadStatus === "done" && fileType === "text" && (
          <div className="prose dark:prose-invert" style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
            <div dangerouslySetInnerHTML={{ __html: output || "" }} />
            {stickyNotes.map((note, i) => (
              <div key={i} className="mt-2 p-2 bg-yellow-100 dark:bg-yellow-300 text-black rounded">
                🗒️ Sticky Note {note.unitIndex + 1}: {note.content}
              </div>
            ))}
          </div>
        )}

        {uploadStatus !== "done" && (
          <div className="text-center text-zinc-500 dark:text-zinc-400">
            {uploadStatus === "uploading"
              ? "Uploading file..."
              : uploadStatus === "processing"
              ? "Processing file..."
              : "Upload a file to begin"}
          </div>
        )}
      </main>
    </div>
  );
}