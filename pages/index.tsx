"use client";

import Head from "next/head";
import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { parseBookWithChapters, generateProgressiveReadingHTML } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import Loader from "../components/ui/loader";

// Use dynamic import with proper loading state for the PDF Viewer
const PDFViewer = dynamic(() => import("../components/PDFViewer"), {
  ssr: false,
  loading: () => <Loader label="Loading PDF viewer..." />
});

// Use dynamic import for HybridReader
const HybridReader = dynamic(() => import("../components/HybridReader"), { 
  ssr: false,
  loading: () => <Loader label="Loading reader..." />
});

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "none";
type ViewMode = "original" | "chapters" | "progressive" | "hybrid";

/**
 * Creates a more reliable blob URL for file viewing
 * @param file The file to create a URL for
 * @returns A promise that resolves to a blob URL
 */
const createReliableBlobUrl = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      // For PDFs, we need to ensure the file is fully loaded
      const reader = new FileReader();
      
      reader.onload = () => {
        // Create a new Blob from the ArrayBuffer
        const blob = new Blob([reader.result as ArrayBuffer], { type: file.type });
        const url = URL.createObjectURL(blob);
        resolve(url);
      };
      
      reader.onerror = () => {
        reject(new Error("Failed to read file"));
      };
      
      reader.readAsArrayBuffer(file);
    } catch (err) {
      reject(err);
    }
  });
};

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

  useEffect(() => {
    document.title = "Thought-Unit Reader";
  }, []);

  // Updated handleFileChange function with improved blob URL handling
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const uploadedFile = files[0];
    if (!uploadedFile) return;

    setUploadStatus("uploading");
    
    try {
      // Create a more reliable blob URL
      const url = await createReliableBlobUrl(uploadedFile);
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
    } catch (err) {
      console.error("File handling error:", err);
      setUploadStatus("error");
    }
  }, []);

  const handleZoom = (delta: number) => {
    setZoom((z) => Math.max(0.5, Math.min(3, z + delta)));
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

        {uploadStatus === "uploading" && <Loader label="Uploading file..." />}
        {uploadStatus === "processing" && <Loader label="Processing your file..." />}
        {uploadStatus === "error" && (
          <p className="text-red-500">Unsupported file or parsing failed. Please try again.</p>
        )}

        {uploadStatus === "done" && (
          <>
            <div className="flex gap-4 my-4 flex-wrap">
              <Button onClick={() => setViewMode("original")} variant={viewMode === "original" ? "default" : "secondary"}>Original View</Button>
              <Button onClick={() => setViewMode("progressive")} variant={viewMode === "progressive" ? "default" : "outline"}>Progressive View</Button>
              <Button onClick={() => setViewMode("hybrid")} variant={viewMode === "hybrid" ? "default" : "outline"}>Hybrid View</Button>
            </div>

            {/* Updated PDF Viewer */}
            {viewMode === "original" && fileType === "pdf" && (
              <div className="text-center space-y-4">
                {fileURL ? (
                  <PDFViewer 
                    fileUrl={fileURL} 
                    initialScale={zoom} 
                    showControls={true} 
                  />
                ) : (
                  <div className="p-8 border rounded text-red-500">
                    No PDF file loaded
                  </div>
                )}
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