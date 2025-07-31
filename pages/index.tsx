"use client";

import Head from "next/head";
import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import { parseBookWithChapters, generateProgressiveReadingHTML } from "@/lib/parser";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import Loader from "@/components/ui/loader";
import HybridReader from "@/components/HybridReader";

// Configure PDF.js worker
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

  useEffect(() => {
    document.title = "Thought-Unit Reader";
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    const url = URL.createObjectURL(uploadedFile);
    setFileURL(url);

    const isPDF = uploadedFile.name.endsWith(".pdf");
    const isText = uploadedFile.name.endsWith(".txt") || uploadedFile.name.endsWith(".docx");

    if (isPDF) {
      setFileType("pdf");
      setUploadStatus("done");
    } else if (isText) {
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
        console.error("Parsing error:", err);
        setUploadStatus("error");
      }
    } else {
      setUploadStatus("error");
    }
  }, []);

  const handleZoom = (delta: number) => {
    setZoom((z) => Math.max(0.5, Math.min(3, z + delta)));
  };

  const goToPage = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = (e.currentTarget.elements.namedItem("page") as HTMLInputElement)?.value;
    const page = parseInt(value);
    if (!isNaN(page) && page >= 1 && page <= numPages) {
      setPageNumber(page);
    }
  };

  return (
    <>
      <Head>
        <title>Thought-Unit Reader</title>
        <meta
          name="description"
          content="An AI-powered learning platform that transforms any textbook into a smart, digestible experience with progressive, hybrid, and thought-unit views."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="p-6 max-w-6xl mx-auto min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white">
        <header className="mb-6 text-center">
          <h1 className="text-4xl font-bold text-pink-500">Thought-Unit Reader</h1>
          <p className="text-sm text-gray-400">Read deeper, faster, and smarter.</p>
        </header>

        <div className="mb-6 flex items-center gap-4 flex-wrap">
          <Label>Enable AI Mode</Label>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          <Button onClick={() => fileInputRef.current?.click()}>Upload Book</Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.pdf,.docx"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {uploadStatus === "processing" && <Loader label="Processing your file..." />}
        {uploadStatus === "error" && (
          <p className="text-red-500">Unsupported file or parsing failed. Please try again.</p>
        )}

        {uploadStatus === "done" && (
          <>
            <div className="flex gap-4 my-4 flex-wrap">
              <Button onClick={() => setViewMode("original")} variant="secondary">Original View</Button>
              <Button onClick={() => setViewMode("progressive")} variant="outline">Progressive View</Button>
              <Button onClick={() => setViewMode("hybrid")} variant="default">Hybrid View</Button>
            </div>

            {/* Original PDF Viewer */}
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

                <form onSubmit={goToPage} className="mt-2 flex justify-center gap-2">
                  <input
                    type="number"
                    name="page"
                    min={1}
                    max={numPages}
                    className="w-20 border rounded px-2 py-1 text-center"
                    placeholder="Page #"
                  />
                  <Button type="submit">Go</Button>
                </form>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Page {pageNumber} of {numPages}
                </p>
              </div>
            )}

            {/* Progressive Text View */}
            {viewMode === "progressive" && fileType === "text" && (
              <div
                className="prose prose-sm sm:prose-base max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: parsedHTML }}
              />
            )}

            {/* Hybrid Thought-Unit View */}
            {viewMode === "hybrid" && inputText && (
              <div className="border rounded-xl p-6 shadow bg-zinc-50 dark:bg-zinc-900">
                <HybridReader inputText={inputText} />
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}