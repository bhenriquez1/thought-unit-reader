// pages/index.tsx - Enhanced Hybrid Thought Unit Reader
import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
// Removed react-pdf CSS imports for deployment compatibility

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

  // Hybrid reader states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [chunkSpeed, setChunkSpeed] = useState(2000);
  const [wordSpeed, setWordSpeed] = useState(300);
  const [maxChunkSize, setMaxChunkSize] = useState(6);
  const [showSettings, setShowSettings] = useState(false);
  const [wpm, setWpm] = useState(200);
  
  const chunkTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wordTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate reading speeds based on WPM
  useEffect(() => {
    const wordMs = (60 / wpm) * 1000;
    setWordSpeed(wordMs);
    setChunkSpeed(wordMs * maxChunkSize * 1.5);
  }, [wpm, maxChunkSize]);

  // Enhanced text chunking with natural language processing - FIXED TYPE
  const createThoughtUnits = useCallback((inputText: string) => {
    if (!inputText) return [];
    
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
    
    return chunks.filter(chunk => chunk.trim().length > 0);
  }, [maxChunkSize]);

  const thoughtUnits = createThoughtUnits(inputText);

  const getCurrentChunkWords = () => {
    if (currentChunkIndex >= thoughtUnits.length) return [];
    return thoughtUnits[currentChunkIndex].split(/\s+/);
  };

  const currentWords = getCurrentChunkWords();

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
  };

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
    handleReset();

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
        
        // Switch to hybrid mode by default
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
                        width={Math.min(450, typeof window !== 'undefined' ? window.innerWidth * 0.4 : 450)}
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
                    Hybrid reading combines thought units with dynamic word highlighting for enhanced comprehension and speed.
                  </p>
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
                    <div className="text-sm text-gray-500 mb-4 font-medium">
                      Thought Unit {currentChunkIndex + 1} of {thoughtUnits.length}
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

                  {/* All Units Preview */}
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">All Units:</h4>
                    {thoughtUnits.map((chunk, index) => (
                      <button
                        key={index}
                        onClick={() => handleChunkClick(index)}
                        className={`w-full text-left p-2 rounded-lg transition-all text-xs ${
                          index === currentChunkIndex
                            ? 'bg-blue-100 border border-blue-400 text-blue-900'
                            : index < currentChunkIndex
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <span className="font-bold mr-2">#{index + 1}</span>
                        {chunk}
                      </button>
                    ))}
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