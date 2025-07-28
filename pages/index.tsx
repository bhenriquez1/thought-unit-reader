// pages/index.tsx
import { useState, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { parseBookWithChapters } from "@/lib/parser";
import HybridReader from "@/components/HybridReader";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type ViewMode = "original" | "chapters" | "hybrid" | "rightbrain";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [viewMode, setViewMode] = useState<ViewMode>("chapters");
  const [chapters, setChapters] = useState<{ title: string; page: number }[]>([]);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPdfUrl(url);
    parseBookWithChapters(file).then(setChapters);
  }, [file]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleChapterClick = (page: number) => {
    setCurrentPage(page);
    setViewMode("original");
  };

  return (
    <div className="flex">
      <aside className="w-64 p-4 bg-black text-white min-h-screen">
        <h2 className="font-bold text-lg mb-4">📚 Chapters</h2>
        <div className="mb-4">
          <Label htmlFor="fileUpload">Upload a File</Label>
          <input
            id="fileUpload"
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            className="text-black"
          />
        </div>
        <div className="mb-4">
          <Label>Reading Mode</Label>
          <select
            className="w-full p-2 text-black"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
          >
            <option value="chapters">Chapter View</option>
            <option value="original">Original View</option>
            <option value="hybrid">Hybrid Reader</option>
            <option value="rightbrain">Right Brain View</option>
          </select>
        </div>
        {viewMode === "chapters" && chapters.length > 0 && (
          <div className="space-y-2">
            {chapters.map((ch, i) => (
              <Button
                key={i}
                className="w-full justify-start text-left text-sm truncate"
                onClick={() => handleChapterClick(ch.page)}
              >
                {ch.title}
              </Button>
            ))}
          </div>
        )}
      </aside>

      <main className="flex-1 p-4">
        {viewMode === "original" && pdfUrl && (
          <>
            <div className="flex justify-between items-center mb-4">
              <Button onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}>←</Button>
              <span>Page {currentPage} / {numPages}</span>
              <Button onClick={() => setCurrentPage((prev) => Math.min(prev + 1, numPages))}>→</Button>
            </div>
            <Document file={pdfUrl} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
              <Page pageNumber={currentPage} width={900} />
            </Document>
          </>
        )}

        {viewMode === "hybrid" && <HybridReader />}

        {viewMode === "rightbrain" && (
          <div className="text-xl">🧠 Right Brain View coming soon... (auto diagrams + voice)</div>
        )}
      </main>
    </div>
  );
}