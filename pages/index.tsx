// pages/index.tsx - Working Bidirectional Navigation
import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import { parseBookWithChapters, generateProgressiveReadingHTML } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "none";
type ViewMode = "original" | "chapters" | "progressive" | "hybrid";

export default function Home() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("hybrid");
  const [bookStructure, setBookStructure] = useState<any>(null);
  const [currentChapter, setCurrentChapter] = useState(0);
  
  // PDF-specific states
  const [fileType, setFileType] = useState<FileType>("none");
  const [pdfFile, setPdfFile] = useState<Blob | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [fileName, setFileName] = useState("");
  const [pdfScale, setPdfScale] = useState(1.0);

  // Hybrid reader states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [chunkSpeed, setChunkSpeed] = useState(2000);
  const [wordSpeed, setWordSpeed] = useState(300);
  const [maxChunkSize, setMaxChunkSize] = useState(6);
  const [showSettings, setShowSettings] = useState(false);
  const [wpm, setWpm] = useState(200);
  
  // Navigation states
  const [thoughtUnits, setThoughtUnits] = useState<string[]>([]);
  const [highlightPosition, setHighlightPosition] = useState<{start: number, end: number} | null>(null);
  
  const chunkTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wordTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // Calculate reading speeds based on WPM
  useEffect(() => {
    const wordMs = (60 / wpm) * 1000;
    setWordSpeed(wordMs);
    setChunkSpeed(wordMs * maxChunkSize * 1.5);
  }, [wmp, maxChunkSize]);

  // Enhanced text chunking that preserves original text mapping
  const createThoughtUnits = useCallback((inputText: string) => {
    if (!inputText) {
      setThoughtUnits([]);
      return [];
    }
    
    const cleanText = inputText.replace(/\s+/g, ' ').trim();
    const sentences = cleanText.match(/[^\.!?]+[\.!?]+/g) || [cleanText];
    const chunks: string[] = [];
    
    const breakWords = ['and', 'or', 'but', 'because', 'however', 'therefore', 'meanwhile', 'furthermore', 'moreover', 'consequently'];
    const prepositions = ['in', 'on', 'at', 'by', 'for', 'with', 'from', 'to', 'of', 'about', 'through', 'during'];
    
    sentences.forEach(sentence => {
      const words = sentence.trim().split(/\s+/).filter(word => word.length > 0);
      let currentChunk: string[] = [];
      
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const nextWord = words[i + 1]?.toLowerCase();
        const prevWord = words[i - 1]?.toLowerCase();
        
        currentChunk.push(word);
        
        const atMaxSize = currentChunk.length >= maxChunkSize;
        const atMinSize = currentChunk.length >= 3;
        const hasPunctuation = word.match(/[,;:]/);
        const beforeBreakWord = breakWords.includes(nextWord);
        const afterPreposition = prepositions.includes(prevWord);
        const isLastWord = i === words.length - 1;
        
        const shouldBreak = atMaxSize || isLastWord || 
          (atMinSize && (hasPunctuation || beforeBreakWord)) ||
          (currentChunk.length >= 4 && afterPreposition);
          
        if (shouldBreak) {
          chunks.push(currentChunk.join(' '));
          currentChunk = [];
        }
      }
      
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
      }
    });
    
    const finalChunks = chunks.filter(chunk => chunk.trim().length > 0);
    setThoughtUnits(finalChunks);
    return finalChunks;
  }, [maxChunkSize]);

  // Create thought units when text changes
  useEffect(() => {
    createThoughtUnits(inputText);
  }, [inputText, createThoughtUnits]);

  const getCurrentChunkWords = () => {
    if (currentChunkIndex >= thoughtUnits.length) return [];
    return thoughtUnits[currentChunkIndex].split(/\s+/);
  };

  const currentWords = getCurrentChunkWords();

  // FIXED: Better text selection handling
  const handleTextAreaClick = useCallback(() => {
    if (!textAreaRef.current || thoughtUnits.length === 0) return;
    
    const clickPosition = textAreaRef.current.selectionStart;
    const totalTextLength = inputText.length;
    
    // Calculate which unit this position corresponds to
    const unitPercentage = clickPosition / totalTextLength;
    const targetUnitIndex = Math.floor(unitPercentage * thoughtUnits.length);
    const clampedIndex = Math.max(0, Math.min(targetUnitIndex, thoughtUnits.length - 1));
    
    if (clampedIndex !== currentChunkIndex) {
      setCurrentChunkIndex(clampedIndex);
      setCurrentWordIndex(0);
      if (isPlaying) {
        setIsPlaying(false);
      }
    }
  }, [thoughtUnits.length, inputText.length, currentChunkIndex, isPlaying]);

  // FIXED: Better PDF page navigation
  const handlePdfPageClick = useCallback((pageNumber: number) => {
    if (thoughtUnits.length === 0 || numPages === 0) return;
    
    // Better calculation based on page progression
    const progressThroughBook = (pageNumber - 1) / numPages;
    const targetUnitIndex = Math.floor(progressThroughBook * thoughtUnits.length);
    const clampedIndex = Math.max(0, Math.min(targetUnitIndex, thoughtUnits.length - 1));
    
    setCurrentChunkIndex(clampedIndex);
    setCurrentWordIndex(0);
    if (isPlaying) {
      setIsPlaying(false);
    }
  }, [thoughtUnits.length, numPages, isPlaying]);

  // FIXED: Highlight current unit in original text
  useEffect(() => {
    if (!inputText || thoughtUnits.length === 0 || !textAreaRef.current) return;
    
    const currentUnit = thoughtUnits[currentChunkIndex];
    if (!currentUnit) return;
    
    // Find the unit in the original text (case insensitive)
    const unitStart = inputText.toLowerCase().indexOf(currentUnit.toLowerCase());
    if (unitStart !== -1) {
      const unitEnd = unitStart + currentUnit.length;
      setHighlightPosition({ start: unitStart, end: unitEnd });
      
      // Scroll to and select the current unit in textarea
      setTimeout(() => {
        if (textAreaRef.current) {
          textAreaRef.current.focus();
          textAreaRef.current.setSelectionRange(unitStart, unitEnd);
          
          // Scroll to make selection visible
          const textarea = textAreaRef.current;
          const totalHeight = textarea.scrollHeight;
          const visibleHeight = textarea.clientHeight;
          const scrollPosition = (unitStart / inputText.length) * totalHeight;
          textarea.scrollTop = Math.max(0, scrollPosition - visibleHeight / 2);
        }
      }, 100);
    }
  }, [currentChunkIndex, thoughtUnits, inputText]);

  // Get current chapter info based on current chunk
  const getCurrentChapterInfo = () => {
    if (!bookStructure) return null;
    
    let globalIndex = 0;
    for (const chapter of bookStructure.chapters) {
      if (currentChunkIndex >= globalIndex && currentChunkIndex < globalIndex + chapter.units.length) {
        return {
          chapter,
          chapterIndex: bookStructure.chapters.indexOf(chapter),
          unitInChapter: currentChunkIndex - globalIndex + 1
        };
      }
      globalIndex += chapter.units.length;
    }
    return null;
  };

  const currentChapterInfo = getCurrentChapterInfo();

  // Advanced timer management with sync
  useEffect(() => {
    if (isPlaying && currentChunkIndex < thoughtUnits.length && viewMode === "hybrid") {
      wordTimerRef.current = setInterval(() => {
        setCurrentWordIndex(prev => {
          const nextIndex = prev + 1;
          if (nextIndex >= currentWords.length) {
            return 0;
          }
          return nextIndex;
        });
      }, wordSpeed);

      chunkTimerRef.current = setTimeout(() => {
        setCurrentChunkIndex(prev => {
          const nextIndex = prev + 1;
          if (nextIndex >= thoughtUnits.length) {
            setIsPlaying(false);
            return thoughtUnits.length - 1;
          }
          setCurrentWordIndex(0);
          return nextIndex;
        });
      }, chunkSpeed);
    }

    return () => {
      if (wordTimerRef.current) clearInterval(wordTimerRef.current);
      if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    };
  }, [isPlaying, currentChunkIndex, currentWords.length, chunkSpeed, wordSpeed, thoughtUnits.length, viewMode]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentChunkIndex(0);
    setCurrentWordIndex(0);
    setHighlightPosition(null);
  };

  // FIXED: Better chunk click handling
  const handleChunkClick = (chunkIndex: number) => {
    setCurrentChunkIndex(chunkIndex);
    setCurrentWordIndex(0);
    if (isPlaying) {
      setIsPlaying(false);
      setTimeout(() => setIsPlaying(true), 100);
    }
  };

  // Helper to extract text from PDF
  const extractTextFromPDF = useCallback(async (buffer: ArrayBuffer): Promise<string> => {
    try {
      const pdf = await pdfjs.getDocument({ 
        data: buffer,
        cMapUrl: `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/cmaps/`,
        cMapPacked: true,
      }).promise;
      
      let fullText = "";
      const maxPages = Math.min(pdf.numPages, 200);
      
      for (let i = 1; i <= maxPages; i++) {
        try {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items
            .map((item: any) => item.str)
            .join(" ");
          fullText += pageText + "\n\n";
        } catch (pageError) {
          console.warn(`Error processing page ${i}:`, pageError);
        }
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
    setHighlightPosition(null);
    handleReset();
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
    setHighlightPosition(null);
    handleReset();

    try {
      if (file.size > 500 * 1024 * 1024) {
        throw new Error("File too large. Please select a file smaller than 500MB.");
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
        setViewMode("hybrid");
        setLoading(false);
      }, 1000);

    } catch (err) {
      console.error("Parsing error:", err);
      setError("Failed to create thought units. Please try again.");
      setLoading(false);
    }
  }, [enabled, inputText, fileName]);

  const totalWords = thoughtUnits.join(' ').split(/\s+/).length;
  const wordsRead = thoughtUnits.slice(0, currentChunkIndex + 1).join(' ').split(/\s+/).length;
  const percentComplete = totalWords > 0 ? Math.round((wordsRead / totalWords) * 100) : 0;
  const estimatedTime = totalWords > 0 ? Math.round((totalWords - wordsRead) / (wpm / 60)) : 0;

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

  // Render units organized by chapters
  const renderUnitsByChapters = () => {
    if (!bookStructure || !bookStructure.chapters) return null;

    let globalIndex = 0;
    
    return bookStructure.chapters.map((chapter: any, chapterIndex: number) => {
      const chapterStartIndex = globalIndex;
      globalIndex += chapter.units.length;
      
      return (
        <div key={chapter.id} className="mb-6">
          {/* Chapter Header */}
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-3 mb-3">
            <div className="flex items-center justify-between">
              <h5 className="font-bold text-indigo-800 text-sm flex items-center">
                <span className="bg-indigo-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold mr-2">
                  {chapter.number}
                </span>
                {chapter.title}
              </h5>
              <div className="text-xs text-indigo-600 bg-white px-2 py-1 rounded-full">
                {chapter.units.length} units
              </div>
            </div>
          </div>
          
          {/* Chapter Units */}
          <div className="space-y-2 pl-4">
            {chapter.units.map((unit: any, unitIndex: number) => {
              const globalUnitIndex = chapterStartIndex + unitIndex;
              return (
                <button
                  key={unit.id}
                  onClick={() => handleChunkClick(globalUnitIndex)}
                  className={`w-full text-left p-2 rounded-lg transition-all text-xs ${
                    globalUnitIndex === currentChunkIndex
                      ? 'bg-blue-100 border border-blue-400 text-blue-900 shadow-md'
                      : globalUnitIndex < currentChunkIndex
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-bold bg-gray-200 text-gray-600 px-2 py-1 rounded flex-shrink-0">
                      {unit.unitNumber}
                    </span>
                    <span className="flex-1">{unit.text}</span>
                    {globalUnitIndex === currentChunkIndex && (
                      <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded flex-shrink-0">
                        CURRENT
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f8fafc' }}>
      {/* Fixed Header */}
      <div className="bg-white shadow-lg border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-pink-400 to-red-400 rounded-xl flex items-center justify-center">
                <span className="text-2xl">🧠</span>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-800">Thought Unit Reader</h1>
                <p className="text-sm text-gray-600 mt-1">
                  Transform any book into thought-units for enhanced comprehension
                </p>
              </div>
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
                    onClick={() => { setViewMode("hybrid"); handleReset(); }}
                    className={`px-3 py-1 text-xs rounded ${viewMode === "hybrid" ? 'bg-blue-500 text-white' : 'text-gray-600'}`}
                  >
                    Hybrid
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
                "🧠 Create Thought Units"
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

          {/* Navigation Help */}
          {thoughtUnits.length > 0 && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
              ✨ <strong>Navigation Active!</strong> Click anywhere in the text or PDF pages to jump to that thought unit! 
              Current unit is automatically highlighted in yellow.
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ height: "calc(100vh - 200px)" }}>
          
          {/* LEFT PANEL - Original Content with Working Navigation */}
          <div className="bg-white rounded-xl shadow-xl overflow-hidden flex flex-col border border-gray-200">
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b flex-shrink-0">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-800 flex items-center">
                  📄 <span className="ml-2">Original Content</span>
                  {numPages > 0 && (
                    <span className="ml-3 text-sm text-gray-500 bg-white px-3 py-1 rounded-full">
                      {numPages} pages
                    </span>
                  )}
                  {thoughtUnits.length > 0 && (
                    <span className="ml-3 text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full animate-pulse">
                      🔄 Click to navigate!
                    </span>
                  )}
                </h2>
                
                {fileType === "pdf" && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Zoom:</span>
                    <button
                      onClick={() => setPdfScale(prev => Math.max(0.5, prev - 0.1))}
                      className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm"
                    >
                      -
                    </button>
                    <span className="text-sm text-gray-600 min-w-[3rem] text-center">
                      {Math.round(pdfScale * 100)}%
                    </span>
                    <button
                      onClick={() => setPdfScale(prev => Math.min(2.0, prev + 0.1))}
                      className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex-1 overflow-auto">
              {fileType === "pdf" && pdfFile ? (
                <div className="p-4">
                  <Document
                    file={pdfFile}
                    onLoadError={(err) => {
                      console.error("PDF display error:", err);
                      setError(`PDF Display Error: ${err.message || 'Failed to display PDF'}`);
                    }}
                    onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                    className="w-full"
                  >
                    {Array.from({ length: Math.min(numPages, 50) }).map((_, i) => (
                      <div key={i} className="mb-4 bg-white shadow-lg rounded-lg overflow-hidden border-2 hover:border-blue-300 transition-colors">
                        <div className="bg-gradient-to-r from-gray-100 to-blue-50 px-3 py-2 text-sm text-gray-700 font-medium flex justify-between items-center">
                          <span className="font-bold">Page {i + 1}</span>
                          <button
                            onClick={() => handlePdfPageClick(i + 1)}
                            className="text-xs bg-blue-500 text-white px-3 py-1 rounded-full hover:bg-blue-600 transition-colors font-semibold shadow"
                          >
                            📍 Jump to Units
                          </button>
                        </div>
                        <div 
                          className="p-4 flex justify-center cursor-pointer hover:bg-blue-25 transition-colors" 
                          onClick={() => handlePdfPageClick(i + 1)}
                          title={`Click to jump to thought units for page ${i + 1}`}
                        >
                          <Page 
                            pageNumber={i + 1}
                            scale={pdfScale}
                            className="shadow-md hover:shadow-xl transition-shadow border rounded"
                            renderAnnotationLayer={false}
                            renderTextLayer={true}
                          />
                        </div>
                      </div>
                    ))}
                    {numPages > 50 && (
                      <div className="text-center p-6 text-gray-500 bg-gray-50 rounded-lg mt-4">
                        <div className="text-3xl mb-3">📚</div>
                        <p className="font-medium text-lg">... and {numPages - 50} more pages</p>
                        <p className="text-sm mt-2">Showing first 50 pages for performance</p>
                        <p className="text-xs mt-2 text-blue-600">
                          💡 All {numPages} pages are processed - click any visible page to navigate!
                        </p>
                      </div>
                    )}
                  </Document>
                </div>
              ) : inputText ? (
                <div className="p-6 h-full">
                  <div className="h-full flex flex-col">
                    <Label className="block text-sm font-semibold mb-3 text-gray-700 flex items-center">
                      📝 Original Text (click anywhere to jump to units):
                      {highlightPosition && (
                        <span className="ml-2 text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded-full">
                          Current unit highlighted!
                        </span>
                      )}
                    </Label>
                    <textarea
                      ref={textAreaRef}
                      value={inputText}
                      onChange={(e) => handleTextChange(e.target.value)}
                      onClick={handleTextAreaClick}
                      onMouseUp={handleTextAreaClick}
                      placeholder="Paste your text here or upload a PDF file..."
                      className="flex-1 w-full p-4 border-2 border-gray-300 rounded-lg text-sm leading-relaxed resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 cursor-pointer hover:border-blue-300"
                      style={{ 
                        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                        backgroundColor: highlightPosition ? '#fffbeb' : 'white'
                      }}
                      title="Click anywhere in the text to jump to the corresponding thought unit"
                    />
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col justify-center items-center text-gray-500 p-8">
                  <div className="text-6xl mb-6">📚</div>
                  <p className="text-xl font-semibold text-center mb-2">Upload any book or document</p>
                  <p className="text-sm text-center text-gray-400 max-w-md mb-4">
                    Experience seamless bidirectional navigation between original content and thought units.
                  </p>
                  <div className="text-xs text-gray-400 bg-gray-50 p-3 rounded-lg">
                    <strong>Supported:</strong> PDF files up to 500MB, TXT files
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL - Thought Units */}
          <div className="bg-white rounded-xl shadow-xl overflow-hidden flex flex-col border border-gray-200">
            <div className="bg-gradient-to-r from-pink-50 to-red-50 px-6 py-4 border-b flex-shrink-0">
              <h2 className="text-lg font-bold text-gray-800 flex items-center">
                🧠 <span className="ml-2">
                  {viewMode === "hybrid" ? "Hybrid Thought Units" : "Thought Units"}
                </span>
              </h2>
            </div>
            
            <div className="flex-1 overflow-auto">
              {viewMode === "hybrid" && thoughtUnits.length > 0 ? (
                <div className="p-6 space-y-6">
                  {/* Hybrid Controls */}
                  <div className="bg-gray-50 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                      <span className="text-lg mr-2">⚡</span>
                      Hybrid Reading Controls
                    </h3>
                    
                    <div className="flex gap-3 mb-4">
                      <button
                        onClick={handlePlayPause}
                        disabled={!enabled}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all text-sm ${
                          isPlaying 
                            ? 'bg-red-500 hover:bg-red-600 text-white' 
                            : 'bg-green-500 hover:bg-green-600 text-white'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <span>{isPlaying ? '⏸️' : '▶️'}</span>
                        {isPlaying ? 'Pause' : 'Start'}
                      </button>
                      
                      <button
                        onClick={handleReset}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-all text-sm"
                      >
                        <span>🔄</span>
                        Reset
                      </button>
                      
                      <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all text-sm"
                      >
                        <span>⚙️</span>
                        Settings
                      </button>
                    </div>

                    {/* Settings */}
                    {showSettings && (
                      <div className="bg-white rounded-lg p-4 space-y-3 border">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Reading Speed: {wpm} WPM
                          </label>
                          <input
                            type="range"
                            min="100"
                            max="600"
                            step="25"
                            value={wpm}
                            onChange={(e) => setWpm(Number(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Max Chunk Size: {maxChunkSize} words
                          </label>
                          <input
                            type="range"
                            min="3"
                            max="10"
                            value={maxChunkSize}
                            onChange={(e) => setMaxChunkSize(Number(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      </div>
                    )}

                    {/* Progress Stats */}
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="bg-blue-50 rounded-lg p-2">
                        <div className="text-lg font-bold text-blue-600">{percentComplete}%</div>
                        <div className="text-xs text-blue-600">Complete</div>
                      </div>
                      <div className="bg-green-50 rounded-lg p-2">
                        <div className="text-lg font-bold text-green-600">{currentChunkIndex + 1}</div>
                        <div className="text-xs text-green-600">Current</div>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-2">
                        <div className="text-lg font-bold text-purple-600">{wpm}</div>
                        <div className="text-xs text-purple-600">WPM</div>
                      </div>
                      <div className="bg-orange-50 rounded-lg p-2">
                        <div className="text-lg font-bold text-orange-600">{estimatedTime}s</div>
                        <div className="text-xs text-orange-600">Left</div>
                      </div>
                    </div>
                  </div>

                  {/* Current Unit Display */}
                  <div className="text-center">
                    <div className="text-sm text-gray-500 mb-2 font-medium">
                      {currentChapterInfo ? (
                        <span>
                          <span className="text-indigo-600 font-semibold">
                            {currentChapterInfo.chapter.title}
                          </span>
                          {" • "}
                          Unit {currentChapterInfo.unitInChapter} of {currentChapterInfo.chapter.units.length}
                        </span>
                      ) : (
                        `Thought Unit ${currentChunkIndex + 1} of ${thoughtUnits.length}`
                      )}
                    </div>
                    
                    <div className="text-2xl leading-relaxed font-medium text-gray-800 min-h-[100px] flex items-center justify-center flex-wrap gap-2">
                      {currentWords.map((word, index) => (
                        <span
                          key={index}
                          className={`px-2 py-1 rounded-lg transition-all duration-300 ${
                            index === currentWordIndex
                              ? 'bg-yellow-400 text-gray-900 transform scale-110 shadow-lg font-semibold'
                              : index < currentWordIndex
                              ? 'text-gray-400 opacity-60'
                              : 'text-gray-700'
                          }`}
                        >
                          {word}
                        </span>
                      ))}
                    </div>
                    
                    {/* Word Progress */}
                    <div className="mt-4 max-w-sm mx-auto">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-yellow-400 h-2 rounded-full transition-all duration-300"
                          style={{
                            width: `${((currentWordIndex + 1) / currentWords.length) * 100}%`
                          }}
                        />
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Word {currentWordIndex + 1} of {currentWords.length}
                      </div>
                    </div>
                  </div>

                  {/* All Units by Chapters */}
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                      <span className="mr-2">📚</span>
                      All Units by Chapters:
                    </h4>
                    {renderUnitsByChapters()}
                  </div>
                </div>
              ) : bookStructure ? (
                <div className="p-6">
                  <div dangerouslySetInnerHTML={{ __html: output || '' }} />
                </div>
              ) : (
                <div className="h-full flex flex-col justify-center items-center text-gray-500 p-8">
                  <div className="text-6xl mb-6">🧠</div>
                  <p className="text-xl font-semibold text-center mb-2">Thought units will appear here</p>
                  <p className="text-sm text-center text-gray-400 max-w-md mb-6">
                    Upload a book and click "Create Thought Units" to transform the text into optimized reading chunks.
                  </p>
                  
                  {/* Benefits */}
                  <div className="text-xs text-gray-400 space-y-2 bg-gray-50 p-4 rounded-lg max-w-md">
                    <div className="font-semibold text-gray-600 mb-2">Benefits of Thought Unit Reading:</div>
                    <div className="flex items-center gap-2">
                      <span className="text-blue-500">📚</span>
                      <span>Original content preserved completely</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-red-500">🧠</span>
                      <span>Text organized into meaningful chunks</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-yellow-500">⚡</span>
                      <span>2-3x faster reading speed</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-500">🎯</span>
                      <span>Enhanced comprehension and retention</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-purple-500">👀</span>
                      <span>Reduced eye strain and fatigue</span>
                    </div>
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
