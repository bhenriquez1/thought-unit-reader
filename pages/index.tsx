"use client";

import Head from "next/head";
import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { parseBookWithChapters, generateProgressiveReadingHTML } from "@/lib/parser";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import Loader from "@/components/ui/loader";
import { cn } from "@/lib/classnames";

// Dynamic import for PDFViewer
const PDFViewer = dynamic(() => import("@/components/PDFViewer"), {
  ssr: false,
  loading: () => <Loader label="Loading PDF viewer..." />,
});

// Dynamic import for HybridReader
const HybridReader = dynamic(() => import("@/components/HybridReader"), {
  ssr: false,
  loading: () => <Loader label="Loading reader..." />,
});

// Dynamic import for ProgressiveView — FIXED CASE
const ProgressiveView = dynamic(() => import("@/components/ProgressiveView"), {
  ssr: false,
  loading: () => <Loader label="Loading progressive view..." />,
});

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "none";
type ViewMode = "original" | "chapters" | "progressive" | "hybrid";

const createReliableBlobUrl = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const blob = new Blob([reader.result as ArrayBuffer], { type: file.type });
        const url = URL.createObjectURL(blob);
        resolve(url);
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsArrayBuffer(file);
    } catch (err) {
      reject(err);
    }
  });
};

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileType, setFileType] = useState<FileType>("none");
  const [fileURL, setFileURL] = useState("");
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [viewMode, setViewMode] = useState<ViewMode>("original");
  const [parsedHTML, setParsedHTML] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1.25);
  const [inputText, setInputText] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [fontFamily, setFontFamily] = useState("Arial, sans-serif");
  const [lineSpacing, setLineSpacing] = useState(1.8);

  const fontOptions = [
    { label: "Arial", value: "Arial, sans-serif" },
    { label: "Verdana", value: "Verdana, sans-serif" },
    { label: "Comic Sans", value: '"Comic Sans MS", cursive' },
    { label: "OpenDyslexic", value: "OpenDyslexic, sans-serif" },
    { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  ];

  const toggleDarkMode = () => setDarkMode(!darkMode);

  useEffect(() => {
    darkMode
      ? document.documentElement.classList.add("dark")
      : document.documentElement.classList.remove("dark");
  }, [darkMode]);

  useEffect(() => {
    document.title = "Thought-Unit Reader";
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setUploadStatus("uploading");

    try {
      const url = await createReliableBlobUrl(uploadedFile);
      setFileURL(url);

      const ext = uploadedFile.name.split(".").pop()?.toLowerCase();
      if (ext === "pdf") {
        setFileType("pdf");
        setUploadStatus("done");
      } else if (ext === "txt" || ext === "docx") {
        setFileType("text");
        setUploadStatus("processing");

        const { parsedUnits, original } = await parseBookWithChapters(uploadedFile);
        const rawText = parsedUnits.map(unit => unit.join(" ")).join("\n");
        const generated = generateProgressiveReadingHTML(rawText);

        setParsedHTML(generated);
        setInputText(original);
        setUploadStatus("done");
      } else {
        setUploadStatus("error");
      }
    } catch (err) {
      console.error(err);
      setUploadStatus("error");
    }
  }, []);

  const handleZoom = (delta: number) =>
    setZoom(z => Math.max(0.5, Math.min(3, z + delta)));

  const goToPage = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const page = parseInt(
      (e.currentTarget.elements.namedItem("page") as HTMLInputElement)?.value
    );
    if (!isNaN(page) && page >= 1 && page <= numPages) setPageNumber(page);
  };

  return (
    <>
      <Head>
        <title>Thought-Unit Reader</title>
        <meta name="description" content="AI-powered reading tool" />
      </Head>

      <main className={cn("p-6 max-w-6xl mx-auto", darkMode ? "bg-zinc-950 text-white" : "bg-white text-black")}>
        {/* Header */}
        <header className="mb-6 text-center">
          <h1 className="text-4xl font-bold text-pink-500">Thought-Unit Reader</h1>
          <p className="text-sm text-gray-500">Read deeper, faster, and smarter.</p>
        </header>

        {/* File Upload */}
        <div className="mb-6 flex items-center gap-4">
          <Label>Enable AI Mode</Label>
          <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
          <Button onClick={() => fileInputRef.current?.click()}>Upload Book</Button>
          <input type="file" accept=".txt,.pdf,.docx" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
        </div>

        {/* View Selector */}
        {uploadStatus === "done" && (
          <div className="flex gap-4 my-4">
            <Button onClick={() => setViewMode("original")}>Original View</Button>
            <Button onClick={() => setViewMode("progressive")}>Progressive View</Button>
            <Button onClick={() => setViewMode("hybrid")}>Hybrid View</Button>
          </div>
        )}

        {/* Render Modes */}
        {viewMode === "original" && fileType === "pdf" && <PDFViewer fileUrl={fileURL} />}
        {viewMode === "progressive" && (
          <ProgressiveView
            content={inputText}
            fontFamily={fontFamily}
            fontSize={fontSize}
            lineSpacing={lineSpacing}
            darkMode={darkMode}
          />
        )}
        {viewMode === "hybrid" && <HybridReader inputText={inputText} />}
      </main>
    </>
  );
}