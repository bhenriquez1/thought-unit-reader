// pages/index.tsx - Thought Unit Reader
import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

import { improveBiomedicalParsing } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";

// Configure PDF.js worker with reliable CDN
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "none";

export default function Home() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  
  // PDF-specific states
  const [fileType, setFileType] = useState<FileType>("none");
  const [pdfFile, setPdfFile] = useState<Blob | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [fileName, setFileName] = useState("");

  // Helper to extract text from PDF
  const extractTextFromPDF = useCallback(async (buffer: ArrayBuffer): Promise<string> => {
    try {
      const pdf = await pdfjs.getDocument({ 
        data: buffer,
        cMapUrl: `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/cmaps/`,
        cMapPacked: true,
      }).promise;
      
      let fullText = "";
      const maxPages = Math.min(pdf.numPages, 50); // Limit for performance
      
      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: any) => item.str)
          .join(" ");
        fullText += pageText + "\n\n";
      }
      return fullText.trim();
    } catch (err) {
      console.error("PDF extraction error:", err);
      throw new Error(`Failed to extract text from PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, []);

  // Handle text input change
  const handleTextChange = useCallback((text: string) => {
    setInputText(text);
    setError(null);
    setOutput(null);
    setFileType("text");
  }, []);

  // Handle file upload with PDF support
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset states
    setError(null);
    setUploadStatus("uploading");
    setFileName(file.name);
    setOutput(null);

    try {
      // File size check (100MB limit)
      if (file.size > 100 * 1024 * 1024) {
        throw new Error("File too large. Please select a file smaller than 100MB.");
      }

      await new Promise(resolve => setTimeout(resolve, 300));
      setUploadStatus("processing");

      let extractedText = "";

      if (file.type === "application/pdf") {
        const buffer = await file.arrayBuffer();
        const pdfBlob = new Blob([buffer], { type: "application/pdf" });
        setPdfFile(pdfBlob);
        setFileType("pdf");
        extractedText = await extractTextFromPDF(buffer);

      } else if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
        extractedText = await file.text();
        setFileType("text");
        setPdfFile(null);

      } else {
        throw new Error(`Unsupported file type: ${file.type || file.name.split('.').pop()}. Please upload PDF or TXT files.`);
      }

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error("No text content found in the file. Please try a different file.");
      }

      setInputText(extractedText);
      setUploadStatus("done");

    } catch (err) {
      console.error("File processing error:", err);
      setError(err instanceof Error ? err.message : "Failed to process file");
      setUploadStatus("error");
      setInputText("");
      setPdfFile(null);
      setFileType("none");
    }
  }, [extractTextFromPDF]);

  // Parse the text using Thought Unit methodology
  const parseText = useCallback(() => {
    if (!enabled) {
      setError("Please enable the Thought Unit analyzer first");
      return;
    }
    
    if (!inputText.trim()) {
      setError("Please enter some text or upload a book to analyze");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setTimeout(() => {
        const parsed = improveBiomedicalParsing(inputText);
        setOutput(parsed);
        setLoading(false);
      }, 800);

    } catch (err) {
      console.error("Parsing error:", err);
      setError("Failed to create thought units. Please try again.");
      setLoading(false);
    }
  }, [enabled, inputText]);

  const getStatusColor = (status: UploadStatus) => {
    switch (status) {
      case "uploading": return "bg-blue-100 text-blue-800";
      case "processing": return "bg-yellow-100 text-yellow-800";
      case "done": return "bg-green-100 text-green-800";
      case "error": return "bg-red-100 text-red-800";
      default: return "";
    }
  };

  const getStatusMessage = (status: UploadStatus) => {
    switch (status) {
      case "uploading": return "📤 Uploading book...";
      case "processing": return "🧠 Extracting content...";
      case "done": return "✅ Book loaded successfully!";
      case "error": return "❌ Upload failed";
      default: return "";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">🧠 Thought Unit Reader</h1>
          <p className="text-gray-600">Transform any book into thought-units for enhanced comprehension</p>
        </div>

        {/* Controls Section */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-3">
              <Label htmlFor="toggleParser" className="text-lg font-medium">
                🧠 Thought Unit Analyzer
              </Label>
              <Switch 
                id="toggleParser" 
                checked={enabled} 
                onCheckedChange={setEnabled} 
              />
            </div>
            <div className="text-sm text-gray-500">
              {inputText.length > 0 && (
                <span>
                  📊 {inputText.length.toLocaleString()} characters | {Math.round(inputText.length / 5)} words
                  {fileName && <span className="ml-2">| 📄 {fileName}</span>}
                </span>
              )}
            </div>
          </div>

          {/* File Upload */}
          <div className="mb-4">
            <Label className="block text-sm font-medium mb-2">
              📄 Upload Book or Document (PDF or TXT files)
            </Label>
            <input
              type="file"
              accept=".pdf,.txt"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
          </div>

          {/* Status Messages */}
          {uploadStatus !== "idle" && (
            <div className={`p-3 rounded-lg mb-4 ${getStatusColor(uploadStatus)}`}>
              {getStatusMessage(uploadStatus)}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-100 text-red-800 rounded-lg mb-4">
              ⚠️ {error}
            </div>
          )}

          {/* Parse Button */}
          <Button
            onClick={parseText}
            disabled={!enabled || !inputText.trim() || loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Creating thought units...
              </span>
            ) : (
              "🧠 Create Thought Units"
            )}
          </Button>
        </div>

        {/* Side-by-Side Content Display */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[70vh]">
          {/* Original Content - Left Side */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h2 className="font-semibold text-lg mb-4 flex items-center">
              📄 Original Content
              {numPages > 0 && (
                <span className="ml-2 text-sm text-gray-500">
                  ({numPages} pages)
                </span>
              )}
            </h2>
            
            <div className="h-full overflow-auto border rounded-lg bg-gray-50">
              {fileType === "pdf" && pdfFile ? (
                <Document
                  file={pdfFile}
                  onLoadError={(err) => {
                    console.error("PDF display error:", err);
                    setError(`PDF Display Error: ${err.message || 'Failed to display PDF'}`);
                  }}
                  onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                  className="w-full"
                >
                  {Array.from({ length: Math.min(numPages, 5) }).map((_, i) => (
                    <Page 
                      key={i} 
                      pageNumber={i + 1}
                      className="mb-4"
                      width={350}
                      renderAnnotationLayer={false}
                      renderTextLayer={false}
                    />
                  ))}
                  {numPages > 5 && (
                    <div className="text-center p-4 text-gray-500">
                      📚 ... and {numPages - 5} more pages
                    </div>
                  )}
                </Document>
              ) : inputText ? (
                <div className="p-4">
                  <Label className="block text-sm font-medium mb-2">
                    Text Content:
                  </Label>
                  <textarea
                    value={inputText}
                    onChange={(e) => handleTextChange(e.target.value)}
                    placeholder="Paste text here or upload a PDF file..."
                    className="w-full h-96 p-4 border border-gray-300 rounded-lg text-sm leading-relaxed resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500 h-full flex flex-col justify-center">
                  <div className="text-4xl mb-4">📚</div>
                  <p className="text-lg font-medium">Upload any book or document</p>
                  <p className="text-sm mt-2">
                    PDF files will be displayed here
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Thought Units - Right Side */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h2 className="font-semibold text-lg mb-4">🧠 Thought Units</h2>
            
            <div className="h-full overflow-auto border rounded-lg p-4 bg-gray-50">
              {output ? (
                <div
                  className="text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: output }}
                />
              ) : (
                <div className="text-center text-gray-500 h-full flex flex-col justify-center">
                  <div className="text-4xl mb-4">🧠</div>
                  <p className="text-lg font-medium">Thought units will appear here</p>
                  <p className="text-sm mt-2">
                    Upload a book and click "Create Thought Units" to begin
                  </p>
                  <div className="mt-6 text-xs text-gray-400 space-y-1">
                    <div>📖 Original content preserved completely</div>
                    <div>🧠 Text organized into meaningful units</div>
                    <div>⚡ Optimized for faster reading</div>
                    <div>🎯 Enhanced comprehension and retention</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}