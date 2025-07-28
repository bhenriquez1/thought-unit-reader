import { useState, useCallback, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useDropzone } from "react-dropzone";
import { parseBookWithChapters, generateProgressiveReadingHTML, generateHybridHTML } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import { useTheme } from "next-themes";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "pdf-text" | "none";
type ViewMode = "original" | "chapters" | "progressive" | "hybrid";

export default function Home() {
  const { theme, setTheme } = useTheme();
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileData, setFileData] = useState<any>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [fileType, setFileType] = useState<FileType>("none");
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("original");
  const [chapters, setChapters] = useState<string[]>([]);
  const [parsedUnits, setParsedUnits] = useState<string[]>([]);
  const [selectedPage, setSelectedPage] = useState(1);
  const [stickyNotes, setStickyNotes] = useState<{ unitIndex: number; content: string }[]>([]);

  const handleExplain = (index: number) => alert(`Explain triggered for unit #${index + 1}`);
  const handleSticky = (index: number) => {
    const note = prompt("Enter your sticky note:");
    if (note) setStickyNotes((prev) => [...prev, { unitIndex: index, content: note }]);
  };

  useEffect(() => {
    (window as any).handleExplain = handleExplain;
    (window as any).handleSticky = handleSticky;
  }, []);

  const handleZoomIn = () => setZoom((z) => z + 0.1);
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.1, 0.5));

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: useCallback((acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setUploadStatus("uploading");
      setFileName(file.name);
      const reader = new FileReader();

      reader.onload = async () => {
        const result = reader.result;

        if (file.type === "application/pdf") {
          setFileData(result);

          const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
          const pdf = await loadingTask.promise;
          let fullText = "";

          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map((item: any) => item.str).join(" ");
            fullText += pageText + "\n";
          }

          const { chapters, parsedUnits } = await parseBookWithChapters(fullText);
          setChapters(chapters);
          setParsedUnits(parsedUnits);
          setUploadStatus("done");
          setFileType("pdf-text");

          localStorage.setItem("uploadedPDF", result as string);
          localStorage.setItem("parsedUnits", JSON.stringify(parsedUnits));
          localStorage.setItem("chapters", JSON.stringify(chapters));
        } else {
          const text = result as string;
          const { chapters, parsedUnits } = await parseBookWithChapters(text);
          setChapters(chapters);
          setParsedUnits(parsedUnits);
          setFileType("text");
          setUploadStatus("done");
          localStorage.setItem("uploadedText", text);
          localStorage.setItem("parsedUnits", JSON.stringify(parsedUnits));
          localStorage.setItem("chapters", JSON.stringify(chapters));
        }
      };

      if (file.type === "application/pdf") {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    }, []),
  });

  const renderTextView = () => {
    switch (viewMode) {
      case "chapters":
        return chapters.map((ch, i) => <h3 key={i} className="text-xl font-bold mt-4">{ch}</h3>);
      case "progressive":
        return <div dangerouslySetInnerHTML={{ __html: generateProgressiveReadingHTML(parsedUnits) }} />;
      case "hybrid":
        return <div dangerouslySetInnerHTML={{ __html: generateHybridHTML(chapters, parsedUnits) }} />;
      case "original":
      default:
        return parsedUnits.map((unit, i) => <p key={i} className="mb-2">{unit}</p>);
    }
  };

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
          <Switch checked={theme === "dark"} onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")} />
        </div>
        <div className="mt-6">
          <Label className="mb-2 block">🗂️ Reading Mode</Label>
          <select
            className="w-full rounded p-1 bg-zinc-100 dark:bg-zinc-800"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
          >
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
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
              Transform any book into thought-units for enhanced comprehension
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setSelectedPage((p) => Math.max(p - 1, 1))}>←</Button>
            <Button onClick={() => setSelectedPage((p) => p + 1)}>→</Button>
            <Button onClick={handleZoomIn}>Zoom In</Button>
            <Button onClick={handleZoomOut}>Zoom Out</Button>
          </div>
        </div>

        {uploadStatus === "done" && (fileType === "text" || fileType === "pdf-text") && (
          <div className="prose dark:prose-invert" style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
            {renderTextView()}
            {stickyNotes.map((note, i) => (
              <div key={i} className="mt-2 p-2 bg-yellow-100 dark:bg-yellow-300 text-black rounded">
                🗒️ Sticky Note {note.unitIndex + 1}: {note.content}
              </div>
            ))}
          </div>
        )}

        {uploadStatus === "done" && fileData && (
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
            <Document file={fileData}>
              <Page pageNumber={selectedPage} />
            </Document>
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