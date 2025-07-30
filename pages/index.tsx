"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { parseBookWithChapters, generateProgressiveReadingHTML } from "@/lib/parser";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import Loader from "@/components/ui/loader";
import HybridReader from "@/components/HybridReader";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "none";
type ViewMode = "original" | "chapters" | "progressive" | "hybrid";

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileType, setFileType] = useState<FileType>("none");
  const [fileURL, setFileURL] = useState<string>("");
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [viewMode, setViewMode] = useState<ViewMode>("original");
  const [parsedHTML, setParsedHTML] = useState<string>("");
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1.25);
  const [inputText, setInputText] = useState("");
  const [enabled, setEnabled] = useState(true);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    const fileURL = URL.createObjectURL(uploadedFile);
    setFileURL(fileURL);

    if (uploadedFile.name.endsWith(".pdf")) {
      setFileType("pdf");
      setUploadStatus("done");
    } else if (uploadedFile.name.endsWith(".txt") || uploadedFile.name.endsWith(".docx")) {
      setFileType("text");
      setUploadStatus("processing");

      try {
        const { parsedUnits } = await parseBookWithChapters(uploadedFile);
        const rawText = parsedUnits.map((unit) => unit.join(" ")).join("\n");
        const generated = generateProgressiveReadingHTML(rawText);
        setParsedHTML(generated);
        setInputText(rawText);
        setUploadStatus("done");
      } catch (err) {
        console.error("Error parsing file:", err);
        setUploadStatus("error");
      }
    } else {
      setUploadStatus("error");
    }
  }, []);

  const handleZoom = (factor: number) => {
    setZoom((prev) => Math.max(0.5, Math.min(3, prev + factor)));
  };

  const goToPage = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = (e.currentTarget.elements.namedItem("page") as HTMLInputElement)?.value;
    const page = parseInt(input);
    if (!isNaN(page) && page >= 1 && page <= numPages) {
      setPageNumber(page);
    }
  };

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <header className="mb-6 text-center">
        <h1 className="text-4xl font-bold text-pink-500">Thought-Unit Reader</h1>
        <p className="text-sm text-gray-300">Read deeper, faster, and smarter.</p>
      </header>

      <div className="mb-6 flex items-center gap-4">
        <Label>Enable AI Mode</Label>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
        <Button onClick={() => fileInputRef.current?.click()}>Upload Book</Button>
        <input
          type="file"
          accept=".txt,.pdf,.docx"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileChange}
        />
      </div>

      {uploadStatus === "processing" && <Loader label="Processing your file..." />}
      {uploadStatus === "error" && (
        <p className="text-red-500">Unsupported file or parsing failed. Please try again.</p>
      )}

      {uploadStatus === "done" && (
        <>
          <div className="flex gap-4 my-4">
            <Button onClick={() => setViewMode("original")} variant="secondary">
              Original View
            </Button>
            <Button onClick={() => setViewMode("progressive")} variant="outline">
              Progressive View
            </Button>
            <Button onClick={() => setViewMode("hybrid")} variant="default">
              Hybrid View
            </Button>
          </div>

          {viewMode === "original" && fileType === "pdf" && (
            <div className="text-center space-y-4">
              <div className="inline-flex gap-2">
                <Button onClick={() => handleZoom(-0.25)}>➖ Zoom Out</Button>
                <Button onClick={() => handleZoom(0.25)}>➕ Zoom In</Button>
              </div>

              <div className="border rounded overflow-hidden w-full flex justify-center bg-white dark:bg-zinc-900">
                <Document
                  file={fileURL}
                  onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                  loading={<Loader label="Loading PDF..." />}
                >
                  <Page pageNumber={pageNumber} scale={zoom} />
                </Document>
              </div>

              <form onSubmit={goToPage} className="mt-2">
                <input
                  type="number"
                  name="page"
                  min={1}
                  max={numPages}
                  className="w-20 border rounded px-2 py-1 mr-2"
                  placeholder="Page #"
                />
                <Button type="submit">Go</Button>
              </form>
              <p className="text-sm text-gray-400">
                Page {pageNumber} of {numPages}
              </p>
            </div>
          )}

          {viewMode === "progressive" && fileType === "text" && (
            <div
              className="prose prose-sm sm:prose-base max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: parsedHTML }}
            />
          )}

          {viewMode === "hybrid" && inputText && (
            <div className="border rounded-xl p-6 shadow">
              <HybridReader inputText={inputText} />
            </div>
          )}
        </>
      )}
    </main>
  );
}
