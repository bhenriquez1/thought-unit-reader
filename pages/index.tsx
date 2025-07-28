// ✅ Original imports unchanged
import { useState, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  const [zoom, setZoom] = useState<number>(1.0);
  const [goToPageInput, setGoToPageInput] = useState("");
  const [chapters, setChapters] = useState<{ title: string; page: number }[]>([]);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPdfUrl(url);

    file.text().then((text) => {
      const { chapters } = parseBookWithChapters(text); // ✅ Synchronously returns `chapters`
      setChapters(chapters);
    });
  }, [file]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setCurrentPage(1);
    }
  };

  const handleChapterClick = (page: number) => {
    setCurrentPage(page);
    setViewMode("original");
  };

  const handleJumpToPage = (page: number) => {
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
            accept=".pdf,.txt"
            onChange={handleFileUpload}
            className="text-black"
          />
        </div>

        <div className="mb-4">
          <Label>Reading Mode</Label>
          <select
            className="w-full p-2 text-black dark:bg-zinc-900 dark:text-white"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
          >
            <option value="chapters">Chapter View</option>
            <option value="original">Original View</option>
            <option value="hybrid">Hybrid Reader</option>
            <option value="rightbrain">Right Brain View</option>
          </select>
        </div>

        {chapters.length > 0 && (
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
            <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
              <div className="flex gap-2">
                <Button onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}>←</Button>
                <Button onClick={() => setCurrentPage((prev) => Math.min(prev + 1, numPages))}>→</Button>
              </div>

              <span className="text-sm font-medium">
                Page {currentPage} / {numPages}
              </span>

              <Button onClick={() => setZoom((prev) => (prev === 1.5 ? 1.0 : 1.5))}>
                Zoom {zoom === 1.5 ? "100%" : "150%"}
              </Button>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const targetPage = parseInt(goToPageInput);
                  if (!isNaN(targetPage) && targetPage >= 1 && targetPage <= numPages) {
                    setCurrentPage(targetPage);
                    setGoToPageInput("");
                  }
                }}
                className="flex gap-2"
              >
                <input
                  type="number"
                  placeholder="Page #"
                  value={goToPageInput}
                  onChange={(e) => setGoToPageInput(e.target.value)}
                  className="border rounded px-2 py-1 w-24 text-sm"
                />
                <Button type="submit" className="text-sm">Go</Button>
              </form>
            </div>

            <Document file={pdfUrl} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
              <Page pageNumber={currentPage} width={900 * zoom} />
            </Document>
          </>
        )}

        {(viewMode === "hybrid" || viewMode === "rightbrain") && file && (
          <HybridReader
            file={file}
            chapters={chapters}
            currentPage={currentPage}
            onJumpToPage={handleJumpToPage}
            viewMode={viewMode} // ✅ Corrected prop name
          />
        )}

        {viewMode === "chapters" && (
          <div className="text-lg font-semibold text-gray-600">
            Select a chapter or switch to another view mode.
          </div>
        )}
      </main>
    </div>
  );
}