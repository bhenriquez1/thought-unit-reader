"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { parseBookWithChapters, generateProgressiveReadingHTML, generateHybridHTML, getPdfViewerHTML } from "@/lib/parser";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";
import { ChevronLeft, ChevronRight, Settings, ZoomIn, ZoomOut } from "lucide-react";

type ViewMode = "original" | "progressive" | "hybrid";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [progressiveView, setProgressiveView] = useState<JSX.Element | null>(null);
  const [hybridView, setHybridView] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("original");
  const [loading, setLoading] = useState(false);
  const [scale, setScale] = useState(1.25);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const loadContent = async () => {
      if (!file) return;

      setLoading(true);
      const { parsedUnits, chapters } = await parseBookWithChapters(file);

      const rawText = parsedUnits.map((u) => u.join(" ")).join("\n");
      setProgressiveView(generateProgressiveReadingHTML(rawText));
      setHybridView(generateHybridHTML(chapters, parsedUnits));
      setLoading(false);
    };

    loadContent();
  }, [file]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleViewSwitch = (mode: ViewMode) => setViewMode(mode);

  const renderContent = () => {
    if (loading) return <Loader />;
    if (!file) return <p className="text-gray-400 mt-4">No file uploaded yet.</p>;

    switch (viewMode) {
      case "original":
        return (
          <div className="mt-4">
            <Document file={file} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
              <Page pageNumber={pageNumber} scale={scale} />
            </Document>
            <div className="mt-2 text-sm text-gray-400">
              Page {pageNumber} of {numPages}
            </div>
          </div>
        );
      case "progressive":
        return <div className="mt-4">{progressiveView}</div>;
      case "hybrid":
        return (
          <div
            className="prose prose-sm sm:prose-base max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: hybridView || "" }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <header className="mb-6 text-center">
        <h1 className="text-4xl font-bold text-pink-500">Thought-Unit Reader</h1>
        <p className="text-sm text-gray-300">Read deeper, faster, and smarter.</p>
      </header>

      <Label className="block mb-2">Upload a file (PDF, DOCX, or TXT):</Label>
      <input
        type="file"
        accept=".pdf,.docx,.txt"
        ref={fileRef}
        className="mb-4"
        onChange={onFileChange}
      />

      <div className="flex gap-4 mt-2 mb-6">
        <Button onClick={() => handleViewSwitch("original")} variant="secondary">
          Original View
        </Button>
        <Button onClick={() => handleViewSwitch("progressive")} variant="outline">
          Progressive
        </Button>
        <Button onClick={() => handleViewSwitch("hybrid")} variant="default">
          Hybrid View
        </Button>
      </div>

      <section className="mt-4">{renderContent()}</section>
    </main>
  );
}