// pages/index.tsx - FIXED VERSION
"use client";

import Head from "next/head";
import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { parseBookWithChapters, generateProgressiveReadingHTML } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import Loader from "../components/ui/loader";
import { cn } from "../lib/classnames";

// Use dynamic import for components with proper loading states
const PDFViewer = dynamic(() => import("../components/PDFViewer"), {
  ssr: false,
  loading: () => <Loader label="Loading PDF viewer..." />
});

const HybridReader = dynamic(() => import("../components/HybridReader"), { 
  ssr: false,
  loading: () => <Loader label="Loading reader..." />
});

const ProgressiveView = dynamic(() => import("../components/ui/ProgressiveView"), {
  ssr: false,
  loading: () => <Loader label="Loading progressive view..." />
});

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "none";
type ViewMode = "original" | "progressive" | "hybrid";

const createReliableBlobUrl = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      
      reader.onload = () => {
        if (reader.result) {
          const blob = new Blob([reader.result as ArrayBuffer], { type: file.type });
          const url = URL.createObjectURL(blob);
          resolve(url);
        }
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
  
  // IMPORTANT: Store the actual text content here
  const [inputText, setInputText] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>(""); // New state for original content
  
  const [aiEnabled, setAiEnabled] = useState<boolean>(true);
  const [darkMode, setDarkMode] = useState<boolean>(false);

  // Font settings
  const [fontSize, setFontSize] = useState<number>(18);
  const [fontFamily, setFontFamily] = useState<string>("Arial, sans-serif");
  const [lineSpacing, setLineSpacing] = useState<number>(1.8);
  
  const fontOptions = [
    { label: "Arial", value: "Arial, sans-serif" },
    { label: "Verdana", value: "Verdana, sans-serif" },
    { label: "Comic Sans", value: '"Comic Sans MS", cursive' },
    { label: "OpenDyslexic", value: "OpenDyslexic, sans-serif" },
    { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  ];
  
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    document.title = "Thought-Unit Reader";
  }, []);

  // Updated handleFileChange with better text extraction
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const uploadedFile = files[0];
    if (!uploadedFile) return;

    setUploadStatus("uploading");
    
    try {
      const url = await createReliableBlobUrl(uploadedFile);
      setFileURL(url);

      const fileExt = uploadedFile.name.split(".").pop()?.toLowerCase() || "";
      const isPDF = fileExt === "pdf";
      const isText = fileExt === "txt" || fileExt === "docx";

      if (isPDF) {
        setFileType("pdf");
        setUploadStatus("done");
        
        // For PDFs, we should try to extract text for Progressive/Hybrid views
        setUploadStatus("processing");
        try {
          const { parsedUnits, original } = await parseBookWithChapters(uploadedFile);
          
          // Store the extracted text
          const textContent = typeof original === 'string' ? original : String(original);
          setInputText(textContent);
          setOriginalContent(textContent);
          
          if (Array.isArray(parsedUnits) && parsedUnits.length > 0) {
            const rawText = parsedUnits
              .map(unit => Array.isArray(unit) ? unit.join(" ") : String(unit))
              .join("\n");
              
            const generated = generateProgressiveReadingHTML(rawText);
            setParsedHTML(generated);
          }
          setUploadStatus("done");
        } catch (err) {
          console.error("PDF text extraction failed:", err);
          // PDF viewing will still work, just not progressive features
          setInputText(""); 
          setOriginalContent("");
          setUploadStatus("done");
        }
        
      } else if (isText) {
        setFileType("text");
        setUploadStatus("processing");
        try {
          const { parsedUnits, original } = await parseBookWithChapters(uploadedFile);
          
          // Store the extracted text
          const textContent = typeof original === 'string' ? original : String(original);
          setInputText(textContent);
          setOriginalContent(textContent);
          
          if (Array.isArray(parsedUnits) && parsedUnits.length > 0) {
            const rawText = parsedUnits
              .map(unit => Array.isArray(unit) ? unit.join(" ") : String(unit))
              .join("\n");
              
            const generated = generateProgressiveReadingHTML(rawText);
            setParsedHTML(generated);
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

  // Debug function to check what content we have
  const debugContent = () => {
    console.log("=== DEBUG CONTENT ===");
    console.log("uploadStatus:", uploadStatus);
    console.log("fileType:", fileType);
    console.log("viewMode:", viewMode);
    console.log("inputText length:", inputText?.length || 0);
    console.log("inputText preview:", inputText?.substring(0, 100) || "No content");
    console.log("originalContent length:", originalContent?.length || 0);
    console.log("===================");
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

      <main className={cn(
        "p-6 max-w-6xl mx-auto min-h-screen transition-colors duration-200",
        darkMode 
          ? "bg-zinc-950 text-white" 
          : "bg-white text-zinc-900"
      )}>
        <header className="mb-6 text-center">
          <h1 className="text-4xl font-bold text-pink-500">Thought-Unit Reader</h1>
          <p className={cn(
            "text-sm",
            darkMode ? "text-gray-300" : "text-gray-500"
          )}>
            Read deeper, faster, and smarter.
          </p>
        </header>

        <div className="mb-6 flex items-center gap-4 flex-wrap justify-between">
          <div className="flex items-center gap-4">
            <Label className={darkMode ? "text-white" : "text-black"}>Enable AI Mode</Label>
            <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
            <Button onClick={() => fileInputRef.current?.click()}>Upload Book</Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.pdf,.docx"
              className="hidden"
              onChange={handleFileChange}
            />
            {/* Debug button - remove in production */}
            <Button onClick={debugContent} variant="outline" size="sm">
              Debug
            </Button>
          </div>
          
          <div className="flex items-center gap-4">
            <Label className={darkMode ? "text-white" : "text-black"}>
              {darkMode ? "Dark Mode" : "Light Mode"}
            </Label>
            <Switch checked={darkMode} onCheckedChange={toggleDarkMode} />
          </div>
        </div>
        
        {/* Font controls */}
        <div className="mb-6 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Font:</Label>
            <select 
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className={cn(
                "px-2 py-1 rounded border text-sm",
                darkMode ? "bg-gray-800 border-gray-600" : "bg-white border-gray-300"
              )}
            >
              {fontOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <Label className="text-sm">Size:</Label>
            <Button 
              onClick={() => setFontSize(Math.max(fontSize - 1, 14))}
              variant="outline"
              size="sm"
              className="h-8 px-2"
            >
              -
            </Button>
            <span className="text-sm w-8 text-center">{fontSize}px</span>
            <Button 
              onClick={() => setFontSize(Math.min(fontSize + 1, 24))}
              variant="outline"
              size="sm"
              className="h-8 px-2"
            >
              +
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <Label className="text-sm">Line Spacing:</Label>
            <Button 
              onClick={() => setLineSpacing(Math.max(lineSpacing - 0.1, 1.0))}
              variant="outline"
              size="sm"
              className="h-8 px-2"
            >
              -
            </Button>
            <span className="text-sm w-12 text-center">{lineSpacing.toFixed(1)}x</span>
            <Button 
              onClick={() => setLineSpacing(Math.min(lineSpacing + 0.1, 3.0))}
              variant="outline"
              size="sm"
              className="h-8 px-2"
            >
              +
            </Button>
          </div>
        </div>

        {uploadStatus === "uploading" && <Loader label="Uploading file..." />}
        {uploadStatus === "processing" && <Loader label="Processing your file..." />}
        {uploadStatus === "error" && (
          <p className="text-red-500">Unsupported file or parsing failed. Please try again.</p>
        )}

        {uploadStatus === "done" && (
          <>
            <div className="flex gap-4 my-4 flex-wrap">
              <Button 
                onClick={() => setViewMode("original")} 
                variant={viewMode === "original" ? "default" : "secondary"}
              >
                Original View
              </Button>
              <Button 
                onClick={() => setViewMode("progressive")} 
                variant={viewMode === "progressive" ? "default" : "outline"}
              >
                Progressive View
              </Button>
              <Button 
                onClick={() => setViewMode("hybrid")} 
                variant={viewMode === "hybrid" ? "default" : "outline"}
              >
                Hybrid View
              </Button>
            </div>

            {/* FIXED VIEW RENDERING */}
            <div className="mt-6">
              {/* Original View */}
              {viewMode === "original" && (
                <div>
                  {fileType === "pdf" && fileURL && (
                    <div className="text-center space-y-4">
                      <PDFViewer 
                        fileUrl={fileURL} 
                        initialScale={zoom} 
                        showControls={true} 
                      />
                    </div>
                  )}
                  
                  {fileType === "text" && originalContent && (
                    <div className={cn(
                      "p-4 border rounded",
                      darkMode ? "bg-zinc-900 border-gray-700" : "bg-white border-gray-300"
                    )}>
                      <pre 
                        className="whitespace-pre-wrap"
                        style={{ 
                          fontFamily: fontFamily,
                          fontSize: `${fontSize}px`,
                          lineHeight: lineSpacing
                        }}
                      >
                        {originalContent}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Progressive View */}
              {viewMode === "progressive" && (
                <div className={cn(
                  "border rounded-xl p-6 shadow",
                  darkMode ? "bg-zinc-900 border-gray-700" : "bg-zinc-50 border-gray-300"
                )}>
                  {inputText && inputText.length > 0 ? (
                    <ProgressiveView 
                      content={inputText}
                      fontFamily={fontFamily}
                      fontSize={fontSize}
                      lineSpacing={lineSpacing}
                      darkMode={darkMode}
                    />
                  ) : (
                    <div className="text-center py-8">
                      <p className={cn(
                        "text-lg",
                        darkMode ? "text-gray-400" : "text-gray-600"
                      )}>
                        {fileType === "pdf" 
                          ? "Text extraction from PDF failed. Progressive view requires readable text content."
                          : "No text content available for progressive reading."
                        }
                      </p>
                      <p className={cn(
                        "text-sm mt-2",
                        darkMode ? "text-gray-500" : "text-gray-500"
                      )}>
                        Try uploading a .txt or .docx file for best results.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Hybrid View */}
              {viewMode === "hybrid" && (
                <div className={cn(
                  "border rounded-xl p-6 shadow",
                  darkMode ? "bg-zinc-900 border-gray-700" : "bg-zinc-50 border-gray-300"
                )}>
                  {inputText && inputText.length > 0 ? (
                    <HybridReader 
                      inputText={inputText}
                      darkMode={darkMode}
                      fontFamily={fontFamily}
                      fontSize={fontSize}
                      lineSpacing={lineSpacing}
                    />
                  ) : (
                    <div className="text-center py-8">
                      <p className={cn(
                        "text-lg",
                        darkMode ? "text-gray-400" : "text-gray-600"
                      )}>
                        {fileType === "pdf" 
                          ? "Text extraction from PDF failed. Hybrid view requires readable text content."
                          : "No text content available for hybrid reading."
                        }
                      </p>
                      <p className={cn(
                        "text-sm mt-2",
                        darkMode ? "text-gray-500" : "text-gray-500"
                      )}>
                        Try uploading a .txt or .docx file for best results.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}