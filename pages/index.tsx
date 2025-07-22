// pages/index.tsx - Enhanced Thought Unit Reader with Progressive Reading
import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

import { parseBookWithChapters, generateProgressiveReadingHTML } from "../lib/enhanced-parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "none";
type ViewMode = "original" | "chapters" | "progressive";

export default function Home() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("original");
  const [bookStructure, setBookStructure] = useState<any>(null);
  const [currentChapter, setCurrentChapter] = useState(0);
  
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
      const maxPages = Math.min(pdf.numPages, 50);
      
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
    setFileType("text");
    setOutput(null);
    setBookStructure(null);
  }, []);

  // Handle file upload
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploadStatus("uploading");
    setFileName(file.name);
    setOutput(null);
    setBookStructure(null);

    try {
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
        throw new Error(`Unsupported file type. Please upload PDF or TXT files.`);
      }

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error("No text content found in the file.");
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

  // Parse text into chapters and thought units
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
        const bookTitle = fileName.replace(/\.(pdf|txt)$/i, '') || "Untitled Book";
        const structure = parseBookWithChapters(inputText, bookTitle);
        setBookStructure(structure);
        
        // Generate initial output based on view mode
        if (viewMode === "progressive") {
          const progressiveHTML = generateProgressiveReadingHTML(structure, currentChapter);
          setOutput(progressiveHTML);
        } else {
          // Generate chapter overview
          const overviewHTML = generateChapterOverview(structure);
          setOutput(overviewHTML);
        }
        
        setLoading(false);
      }, 1000);

    } catch (err) {
      console.error("Parsing error:", err);
      setError("Failed to create thought units. Please try again.");
      setLoading(false);
    }
  }, [enabled, inputText, fileName, viewMode, currentChapter]);

  const generateChapterOverview = (structure: any) => {
    const chaptersHTML = structure.chapters.map((chapter: any, index: number) => {
      return `
        <div class="chapter-overview bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 mb-4 overflow-hidden">
          <div class="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4 border-b border-gray-100">
            <div class="flex justify-between items-center">
              <h3 class="text-lg font-bold text-gray-800">${chapter.title}</h3>
              <div class="flex items-center space-x-3">
                <span class="text-sm text-gray-600 bg-white px-3 py-1 rounded-full">
                  ${chapter.units.length} units
                </span>
                <span class="text-sm text-gray-600 bg-white px-3 py-1 rounded-full">
                  ${chapter.estimatedReadTime}m
                </span>
                <button onclick="startProgressiveReading(${index})" 
                        class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  📖 Start Reading
                </button>
              </div>
            </div>
          </div>
          <div class="p-6">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div class="bg-blue-50 p-3 rounded-lg text-center">
                <div class="text-xl font-bold text-blue-600">${chapter.units.length}</div>
                <div class="text-xs text-blue-600 uppercase tracking-wide">Thought Units</div>
              </div>
              <div class="bg-green-50 p-3 rounded-lg text-center">
                <div class="text-xl font-bold text-green-600">${chapter.wordCount}</div>
                <div class="text-xs text-green-600 uppercase tracking-wide">Words</div>
              </div>
              <div class="bg-purple-50 p-3 rounded-lg text-center">
                <div class="text-xl font-bold text-purple-600">${chapter.estimatedReadTime}m</div>
                <div class="text-xs text-purple-600 uppercase tracking-wide">Est. Time</div>
              </div>
            </div>
            <div class="text-sm text-gray-600">
              First few units preview: ${chapter.units.slice(0, 3).map((unit: any) => unit.text).join(' • ')}...
            </div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="book-overview">
        <!-- Book Summary -->
        <div class="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 rounded-lg mb-6">
          <h2 class="text-2xl font-bold mb-2">${structure.title}</h2>
          <div class="grid grid-cols-3 gap-4 text-center">
            <div>
              <div class="text-2xl font-bold">${structure.chapters.length}</div>
              <div class="text-sm opacity-90">Chapters</div>
            </div>
            <div>
              <div class="text-2xl font-bold">${structure.totalUnits}</div>
              <div class="text-sm opacity-90">Total Units</div>
            </div>
            <div>
              <div class="text-2xl font-bold">${structure.estimatedReadTime}m</div>
              <div class="text-sm opacity-90">Est. Time</div>
            </div>
          </div>
        </div>

        <!-- Chapters -->
        <div class="chapters-list">
          ${chaptersHTML}
        </div>

        <!-- Reading Tips -->
        <div class="bg-amber-50 border border-amber-200 rounded-lg p-6 mt-6">
          <h4 class="font-semibold text-amber-800 mb-3 flex items-center">
            <span class="text-2xl mr-2">📚</span>
            How to Use Progressive Reading
          </h4>
          <div class="text-sm text-amber-700 space-y-2">
            <div>• Click "Start Reading" on any chapter to begin progressive revelation</div>
            <div>• Units will appear automatically at your chosen speed</div>
            <div>• Use the controls to pause, adjust speed, or reset</div>
            <div>• Navigate between chapters using the sidebar</div>
            <div>• Progress is tracked for each chapter</div>
          </div>
        </div>
      </div>

      <script>
        function startProgressiveReading(chapterIndex) {
          // This would reload the page in progressive mode
          window.currentChapter = chapterIndex;
          window.switchToProgressiveMode();
        }
      </script>
    `;
  };

  const switchToProgressiveMode = (chapterIndex: number = 0) => {
    if (!bookStructure) return;
    
    setCurrentChapter(chapterIndex);
    setViewMode("progressive");
    
    const progressiveHTML = generateProgressiveReadingHTML(bookStructure, chapterIndex);
    setOutput(progressiveHTML);
  };

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
      case "processing": return "🧠 Analyzing chapters and creating thought units...";
      case "done": return "✅ Book processed successfully!";
      case "error": return "❌ Processing failed";
      default: return "";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Fixed Header */}
      <div className="bg-white shadow-lg border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center">
                🧠 <span className="ml-2">Thought Unit Reader</span>
                <span className="ml-2 text-lg text-blue-600">Progressive</span>
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Transform any book into chapters and thought-units for progressive reading
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* View Mode Toggle */}
              {bookStructure && (
                <div className="flex items-center space-x-2 border border-gray-300 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode("original")}
                    className={`px-3 py-1 text-xs rounded ${viewMode === "original" ? 'bg-blue-500 text-white' : 'text-gray-600'}`}
                  >
                    Original
                  </button>
                  <button
                    onClick={() => setViewMode("chapters")}
                    className={`px-3 py-1 text-xs rounded ${viewMode === "chapters" ? 'bg-blue-500 text-white' : 'text-gray-600'}`}
                  >
                    Chapters
                  </button>
                  <button
                    onClick={() => switchToProgressiveMode(0)}
                    className={`px-3 py-1 text-xs rounded ${viewMode === "progressive" ? 'bg-blue-500 text-white' : 'text-gray-600'}`}
                  >
                    Progressive
                  </button>
                </div>
              )}
              
              <div className="flex items-center space-x-2">
                <Switch 
                  id="toggleParser" 
                  checked={enabled} 
                  onCheckedChange={setEnabled} 
                />
                <Label htmlFor="toggleParser" className="text-sm font-medium">
                  Analyzer {enabled ? 'ON' : 'OFF'}
                </Label>
              </div>
              
              {inputText.length > 0 && (
                <div className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                  📊 {Math.round(inputText.length / 5)} words
                  {fileName && <span className="ml-2">| 📄 {fileName.length > 20 ? fileName.substring(0, 20) + '...' : fileName}</span>}
                </div>
              )}
            </div>
          </div>

          {/* Controls Row */}
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <input
                type="file"
                accept=".pdf,.txt"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-600 file:mr-4 file:py-3 file:px-6 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-gray-300 rounded-lg p-2"
              />
            </div>
            
            <Button
              onClick={parseText}
              disabled={!enabled || !inputText.trim() || loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold px-8 py-3 text-sm whitespace-nowrap rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
            >
              {loading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </span>
              ) : (
                "🧠 Analyze Book"
              )}
            </Button>
          </div>

          {/* Status Messages */}
          {uploadStatus !== "idle" && (
            <div className={`p-3 rounded-lg mt-3 text-sm ${getStatusColor(uploadStatus)}`}>
              {getStatusMessage(uploadStatus)}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-100 text-red-800 rounded-lg mt-3 text-sm border border-red-200">
              ⚠️ {error}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ height: "calc(100vh - 200px)" }}>
          
          {/* LEFT PANEL - Original Content */}
          <div className="bg-white rounded-xl shadow-xl overflow-hidden flex flex-col border border-gray-200">
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b flex-shrink-0">
              <h2 className="text-lg font-bold text-gray-800 flex items-center">
                📄 <span className="ml-2">Original Content</span>
                {numPages > 0 && (
                  <span className="ml-3 text-sm text-gray-500 bg-white px-3 py-1 rounded-full">
                    {numPages} pages
                  </span>
                )}
              </h2>
            </div>
            
            <div className="flex-1 overflow-auto">
              {fileType === "pdf" && pdfFile ? (
                <div className="p-6">
                  <Document
                    file={pdfFile}
                    onLoadError={(err) => {
                      console.error("PDF display error:", err);
                      setError(`PDF Display Error: ${err.message || 'Failed to display PDF'}`);
                    }}
                    onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                    className="w-full"
                  >
                    {Array.from({ length: Math.min(numPages, 10) }).map((_, i) => (
                      <Page 
                        key={i} 
                        pageNumber={i + 1}
                        className="mb-6 shadow-lg rounded-lg overflow-hidden"
                        width={Math.min(450, window.innerWidth * 0.4)}
                        renderAnnotationLayer={false}
                        renderTextLayer={true}
                      />
                    ))}
                    {numPages > 10 && (
                      <div className="text-center p-6 text-gray-500 bg-gray-50 rounded-lg">
                        <div className="text-2xl mb-2">📚</div>
                        <p className="font-medium">... and {numPages - 10} more pages</p>
                        <p className="text-sm mt-1">Showing first 10 pages for performance</p>
                      </div>
                    )}
                  </Document>
                </div>
              ) : inputText ? (
                <div className="p-6 h-full">
                  <div className="h-full flex flex-col">
                    <Label className="block text-sm font-semibold mb-3 text-gray-700">
                      Original Text (editable):
                    </Label>
                    <textarea
                      value={inputText}
                      onChange={(e) => handleTextChange(e.target.value)}
                      placeholder="Paste your text here or upload a PDF file..."
                      className="flex-1 w-full p-4 border border-gray-300 rounded-lg text-sm leading-relaxed resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                      style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}
                    />
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col justify-center items-center text-gray-500 p-8">
                  <div className="text-6xl mb-6">📚</div>
                  <p className="text-xl font-semibold text-center mb-2">Upload any book or document</p>
                  <p className="text-sm text-center text-gray-400 max-w-md">
                    Progressive reading breaks your content into chapters and reveals thought units automatically as you read.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL - Processed Content */}
          <div className="bg-white rounded-xl shadow-xl overflow-hidden flex flex-col border border-gray-200">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b flex-shrink-0">
              <h2 className="text-lg font-bold text-gray-800 flex items-center">
                {viewMode === "progressive" ? "📖" : "🧠"} 
                <span className="ml-2">
                  {viewMode === "progressive" ? "Progressive Reading" : "Thought Units & Chapters"}
                </span>
              </h2>
            </div>
            
            <div className="flex-1 overflow-auto">
              {output ? (
                <div className="p-6">
                  <div dangerouslySetInnerHTML={{ __html: output }} />
                </div>
              ) : (
                <div className="h-full flex flex-col justify-center items-center text-gray-500 p-8">
                  <div className="text-6xl mb-6">📖</div>
                  <p className="text-xl font-semibold text-center mb-2">Progressive Reading Experience</p>
                  <p className="text-sm text-center text-gray-400 max-w-md mb-6">
                    Upload a book and click "Analyze Book" to automatically detect chapters and create a progressive reading experience.
                  </p>
                  <div className="text-xs text-gray-400 text-center space-y-2 bg-gray-50 p-4 rounded-lg max-w-md">
                    <div className="font-semibold text-gray-600 mb-2">Progressive Reading Features:</div>
                    <div>📖 Automatic chapter detection</div>
                    <div>🎯 Progressive thought unit revelation</div>
                    <div>⏱️ Adjustable reading speed</div>
                    <div>📊 Reading progress tracking</div>
                    <div>🧠 Enhanced comprehension & retention</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Global Script for Progressive Reading */}
      <script dangerouslySetInnerHTML={{
        __html: `
          window.switchToProgressiveMode = function() {
            // This would be handled by React state
            console.log('Switching to progressive mode');
          };
        `
      }} />
    </div>
  );
}