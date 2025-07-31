"use client";

import Head from "next/head";
import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { parseBookWithChapters, generateProgressiveReadingHTML } from "@/lib/parser";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import Loader from "@/components/ui/loader";

// Fix dynamic imports with explicit any type
const HybridReader = dynamic<any>(
  () => import("../components/HybridReader"),
  { 
    ssr: false,
    loading: () => <Loader label="Loading reader..." />
  }
);

// Fixed dynamic import for Document and Page components
const PDFDocument = dynamic<any>(
  () => import("react-pdf").then(mod => mod.Document),
  { ssr: false }
);

const PDFPage = dynamic<any>(
  () => import("react-pdf").then(mod => mod.Page),
  { ssr: false }
);

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
  const [inputText, setInputText] = useState<string>("");
  const [enabled, setEnabled] = useState<boolean>(true);

  // Configure PDF.js worker on component mount
  useEffect(() => {
    try {
      import("react-pdf").then(({ pdfjs }) => {
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
        }
      });
    } catch (error) {
      console.error("Failed to configure PDF worker:", error);
    }
  }, []);

  useEffect(() => {
    document.title = "Thought-Unit Reader";
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const uploadedFile = files[0];
    if (!uploadedFile) return;

    const url = URL.createObjectURL(uploadedFile);
    setFileURL(url);

    const fileExt = uploadedFile.name.split(".").pop()?.toLowerCase() || "";
    const isPDF = fileExt === "pdf";
    const isText = fileExt === "txt" || fileExt === "docx";

    if (isPDF) {
      setFileType("pdf");
      setUploadStatus("done");
    } else if (isText) {
      setFileType("text");
      setUploadStatus("processing");
      try {
        const { parsedUnits, original } = await parseBookWithChapters(uploadedFile);
        
        // Safely handle parsedUnits and generate HTML
        if (Array.isArray(parsedUnits) && parsedUnits.length > 0) {
          const rawText = parsedUnits
            .map(unit => Array.isArray(unit) ? unit.join(" ") : String(unit))
            .join("\n");
            
          const generated = generateProgressiveReadingHTML(rawText);
          setParsedHTML(generated);
          setInputText(typeof original === 'string' ? original : String(original));
          setUploadStatus("done");
        } else {
          throw new Error("Failed to parse document units");
        }
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
    const form = e.currentTarget;
    const pageInput = form.elements.namedItem("page") as HTMLInputElement;
    
    if (pageInput && pageInput.value) {
      const page = parseInt(pageInput.value);
      if (!isNaN(page) && page >= 1 && page <= numPages) {
        setPageNumber(page);
      }
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
                  {fileURL && (
                    <PDFDocument
                      file={fileURL}
                      onLoadSuccess={({ numPages }) => numPages && setNumPages(numPages)}
                      loading={<Loader label="Loading PDF..." />}
                      error={<div className="p-4 text-red-500">Failed to load PDF</div>}
                    >
                      <PDFPage 
                        pageNumber={pageNumber} 
                        scale={zoom} 
                        error={<div className="p-4 text-red-500">Failed to render page</div>}
                      />
                    </PDFDocument>
                  )}
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