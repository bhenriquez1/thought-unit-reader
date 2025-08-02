"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/classnames"; // Using relative import to fix path issues
import { Button } from "../components/ui/button"; // Using relative import to fix path issues
import { ScrollArea } from "../components/ui/scroll-area"; // Using relative import to fix path issues
import Loader from "../components/ui/loader"; // Using relative import to fix path issues

// Import utilities with correct paths
import {
  parseBookWithChapters,
  generateHybridHTML,
  parseTextToUnits,
} from "../lib/parser"; // Using relative import to fix path issues

// Define the Chapter interface directly to avoid import issues
interface Chapter {
  title: string;
  content: string;
  page?: number;
}

// Use dynamic import for PDFViewer with proper loading state
import dynamic from "next/dynamic";

const PDFViewer = dynamic(() => import("./PDFViewer"), {
  ssr: false,
  loading: () => <Loader label="Loading PDF viewer..." />
});

/**
 * Enhanced HybridReader component with dyslexia-friendly features
 */
export default function HybridReader({ inputText }: { inputText?: string }) {
  // Refs for content and scroll handling
  const fileRef = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // File and content state
  const [file, setFile] = useState<File | null>(null);
  const [extension, setExtension] = useState<string>("");
  const [pdfURL, setPdfURL] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"original" | "chapters" | "progressive" | "hybrid">("original");

  // Parsed content state
  const [parsedUnits, setParsedUnits] = useState<string[][]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [originalText, setOriginalText] = useState<string | null>(null);
  const [hybridHTML, setHybridHTML] = useState<string | null>(null);
  const [activeChapter, setActiveChapter] = useState(0);

  // Dyslexia-friendly settings
  const [fontSize, setFontSize] = useState(18);
  const [fontFamily, setFontFamily] = useState("Arial, sans-serif");
  const [lineSpacing, setLineSpacing] = useState(1.8);
  const [wordSpacing, setWordSpacing] = useState(0.16);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Progressive reading state
  const [currentUnit, setCurrentUnit] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const [readingSpeed, setReadingSpeed] = useState(200); // WPM
  const [progress, setProgress] = useState(0);

  const fontOptions = [
    { label: "Arial", value: "Arial, sans-serif" },
    { label: "Verdana", value: "Verdana, sans-serif" },
    { label: "Comic Sans", value: '"Comic Sans MS", cursive' },
    { label: "OpenDyslexic", value: "OpenDyslexic, sans-serif" },
    { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  ];

  // Helper function to get chapter text
  const getChapterText = (index: number): string => {
    if (index < 0 || index >= chapters.length || parsedUnits.length === 0) {
      return "";
    }
    
    const startPage = chapters[index]?.page;
    const start = typeof startPage === 'number' ? startPage - 1 : 0;
    
    const nextChapter = chapters[index + 1];
    const endPage = nextChapter?.page;
    const end = typeof endPage === 'number' ? endPage - 1 : parsedUnits.length;
    
    const safeStart = Math.max(0, Math.min(start, parsedUnits.length));
    const safeEnd = Math.max(safeStart, Math.min(end, parsedUnits.length));
    
    const slicedUnits = parsedUnits.slice(safeStart, safeEnd);
    const flattenedUnits = slicedUnits.flat();
    return flattenedUnits.join(" ");
  };

  // Process input text if provided
  useEffect(() => {
    if (inputText && !file && !loading) {
      setLoading(true);
      try {
        const units = parseTextToUnits(inputText);
        setParsedUnits(units);
        
        if (typeof inputText === 'string') {
          setOriginalText(inputText);
        } else {
          setOriginalText(String(inputText));
        }
        
        if (chapters.length === 0) {
          setChapters([{ 
            title: "Content", 
            content: typeof inputText === 'string' ? inputText : String(inputText),
            page: 1 
          }]);
        }
        
        const html = generateHybridHTML(chapters, units);
        setHybridHTML(typeof html === 'string' ? html : String(html));
        
        setLoading(false);
      } catch (err) {
        console.error("Error parsing input text:", err);
        setHybridHTML("<p class='text-red-500'>Failed to process text.</p>");
        setLoading(false);
      }
    }
  }, [inputText, file, loading, chapters]);

  // Process file when uploaded
  useEffect(() => {
    const loadContent = async () => {
      if (!file) return;
      setLoading(true);
      try {
        const { parsedUnits, chapters, original } = await parseBookWithChapters(file);
        setParsedUnits(parsedUnits);
        setChapters(chapters);
        
        if (typeof original === 'string') {
          setOriginalText(original);
        } else {
          setOriginalText(String(original));
        }
        
        const html = generateHybridHTML(chapters, parsedUnits);
        setHybridHTML(typeof html === 'string' ? html : String(html));
      } catch (err) {
        console.error("Error parsing file:", err);
        setHybridHTML("<p class='text-red-500'>Failed to process file.</p>");
      } finally {
        setLoading(false);
      }
    };
    loadContent();
  }, [file]);

  // Progressive reading logic
  useEffect(() => {
    let intervalId: NodeJS.Timeout | undefined;
    
    if (isReading && parsedUnits.length > 0) {
      const allWords = parsedUnits.flat();
      
      intervalId = setInterval(() => {
        setCurrentUnit(prev => {
          if (prev >= allWords.length - 1) {
            setIsReading(false);
            return prev;
          }
          
          const newUnit = prev + 1;
          setProgress((newUnit / (allWords.length - 1)) * 100);
          return newUnit;
        });
      }, (60 * 1000) / readingSpeed); // Convert WPM to milliseconds
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isReading, parsedUnits, readingSpeed]);

  // Track active chapter on scroll
  useEffect(() => {
    const onScroll = () => {
      if (!chapters.length) return;
      
      for (let i = 0; i < chapters.length; i++) {
        const el = document.getElementById(`chapter-${i}`);
        if (el && el.getBoundingClientRect().top >= 0) {
          setActiveChapter(i);
          break;
        }
      }
    };
    
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [chapters]);

  // File upload handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const uploadedFile = files[0];
    if (!uploadedFile) return;
    
    // Create a more reliable blob URL for file preview
    try {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          const blob = new Blob([reader.result as ArrayBuffer], { type: uploadedFile.type });
          const url = URL.createObjectURL(blob);
          setPdfURL(url);
        }
      };
      reader.readAsArrayBuffer(uploadedFile);
    } catch (error) {
      console.error("Error creating blob URL:", error);
    }

    const fileExt = uploadedFile.name.split(".").pop()?.toLowerCase() || "";
    setFile(uploadedFile);
    setExtension(fileExt);
  };

  // Toggle reading controls
  const toggleReading = () => {
    setIsReading(!isReading);
  };

  // Reset reading position
  const resetReading = () => {
    setCurrentUnit(0);
    setProgress(0);
    setIsReading(false);
  };

  // Toggle dark mode
  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  // Calculate remaining reading time
  const getTimeRemaining = () => {
    if (parsedUnits.length === 0) return "0s";
    
    const allWords = parsedUnits.flat();
    const wordsRemaining = allWords.length - currentUnit - 1;
    const secondsRemaining = Math.ceil((wordsRemaining * 60) / readingSpeed);
    
    if (secondsRemaining < 60) {
      return `${secondsRemaining}s`;
    }
    
    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = secondsRemaining % 60;
    return `${minutes}m ${seconds}s`;
  };

  // Progressive reading view with highlighting
  const renderProgressiveReading = () => {
    if (parsedUnits.length === 0) {
      return <p>No content available</p>;
    }
    
    const allWords = parsedUnits.flat();
    
    return (
      <div className="space-y-6">
        {/* Reading controls */}
        <div className={cn(
          "p-4 rounded-lg",
          isDarkMode ? "bg-gray-800" : "bg-pink-50"
        )}>
          <h3 className="text-lg font-semibold mb-3 flex items-center">
            <span className="mr-2">⚡</span> 
            <span className={isDarkMode ? "text-pink-300" : "text-pink-600"}>
              Progressive Reading Controls
            </span>
          </h3>
          
          <div className="flex flex-wrap gap-3 mb-4">
            <Button 
              onClick={toggleReading}
              className={isReading ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"}
            >
              {isReading ? '⏸ Pause' : '▶ Start'}
            </Button>
            
            <Button 
              onClick={resetReading}
              variant="outline"
            >
              🔄 Reset
            </Button>
            
            <div className="flex items-center ml-auto gap-2">
              <span className="text-sm">Font:</span>
              <select 
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="px-2 py-1 rounded border text-sm"
              >
                {fontOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className={cn(
              "p-3 rounded text-center",
              isDarkMode ? "bg-blue-900/30" : "bg-blue-100"
            )}>
              <div className={cn(
                "text-xl font-bold",
                isDarkMode ? "text-blue-300" : "text-blue-600"
              )}>
                {Math.round(progress)}%
              </div>
              <div className={cn(
                "text-xs",
                isDarkMode ? "text-blue-300" : "text-blue-600"
              )}>
                Complete
              </div>
            </div>
            
            <div className={cn(
              "p-3 rounded text-center",
              isDarkMode ? "bg-green-900/30" : "bg-green-100"
            )}>
              <div className={cn(
                "text-xl font-bold",
                isDarkMode ? "text-green-300" : "text-green-600"
              )}>
                {currentUnit + 1}
              </div>
              <div className={cn(
                "text-xs",
                isDarkMode ? "text-green-300" : "text-green-600"
              )}>
                Current
              </div>
            </div>
            
            <div className={cn(
              "p-3 rounded text-center relative",
              isDarkMode ? "bg-purple-900/30" : "bg-purple-100"
            )}>
              <div className={cn(
                "text-xl font-bold",
                isDarkMode ? "text-purple-300" : "text-purple-600"
              )}>
                {readingSpeed}
              </div>
              <div className={cn(
                "text-xs",
                isDarkMode ? "text-purple-300" : "text-purple-600"
              )}>
                WPM
              </div>
              <div className="absolute right-0 top-0 h-full flex flex-col justify-center pr-1">
                <button 
                  onClick={() => setReadingSpeed(prev => Math.min(prev + 10, 800))}
                  className={cn(
                    "text-xs rounded px-1 mb-1",
                    isDarkMode ? "bg-purple-800" : "bg-purple-200"
                  )}
                >
                  ▲
                </button>
                <button 
                  onClick={() => setReadingSpeed(prev => Math.max(prev - 10, 50))}
                  className={cn(
                    "text-xs rounded px-1",
                    isDarkMode ? "bg-purple-800" : "bg-purple-200"
                  )}
                >
                  ▼
                </button>
              </div>
            </div>
            
            <div className={cn(
              "p-3 rounded text-center",
              isDarkMode ? "bg-orange-900/30" : "bg-orange-100"
            )}>
              <div className={cn(
                "text-xl font-bold",
                isDarkMode ? "text-orange-300" : "text-orange-600"
              )}>
                {getTimeRemaining()}
              </div>
              <div className={cn(
                "text-xs",
                isDarkMode ? "text-orange-300" : "text-orange-600"
              )}>
                Left
              </div>
            </div>
          </div>
          
          <div className="text-center text-sm text-gray-600 dark:text-gray-300 mb-2">
            Word {currentUnit + 1} of {allWords.length}
          </div>
          
          {/* Reading area */}
          <div 
            className={cn(
              "p-4 rounded-lg shadow-inner mb-3",
              isDarkMode ? "bg-gray-900" : "bg-white"
            )}
            style={{ 
              fontFamily: fontFamily,
              fontSize: `${fontSize}px`, 
              lineHeight: lineSpacing,
              wordSpacing: `${wordSpacing}em`
            }}
          >
            {allWords.map((word, index) => (
              <span 
                key={index}
                className={cn(
                  "mr-1",
                  index === currentUnit 
                    ? "bg-yellow-200 text-black px-1 py-0.5 rounded" 
                    : index < currentUnit 
                      ? isDarkMode ? "text-gray-500" : "text-gray-400"
                      : isDarkMode ? "text-white" : "text-black"
                )}
              >
                {word}
              </span>
            ))}
          </div>
          
          {/* Progress bar */}
          <div className={cn(
            "w-full h-2 rounded-full overflow-hidden",
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          )}>
            <div 
              className={cn(
                "h-full transition-all duration-300",
                isDarkMode ? "bg-yellow-500" : "bg-yellow-400"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    );
  };

  // Render chapters view
  const renderProgressiveChapters = () => {
    if (chapters.length === 0) {
      return <p>No chapters found</p>;
    }
    
    return (
      <div className="flex flex-col md:flex-row gap-6 w-full">
        <aside className={cn(
          "sticky top-4 md:w-1/4 w-full space-y-3 p-4 border rounded-md shadow",
          isDarkMode ? "bg-zinc-900" : "bg-white"
        )}>
          <h2 className={cn(
            "font-bold text-lg mb-2",
            isDarkMode ? "text-white" : "text-zinc-800"
          )}>
            Chapters
          </h2>
          <ul className="space-y-2">
            {chapters.map((ch, i) => (
              <li key={i}>
                <a
                  href={`#chapter-${i}`}
                  className={cn(
                    "block text-sm font-medium hover:text-pink-600",
                    activeChapter === i
                      ? "text-pink-600"
                      : isDarkMode ? "text-zinc-300" : "text-zinc-700"
                  )}
                >
                  {ch.title || `Chapter ${i + 1}`}
                </a>
              </li>
            ))}
          </ul>
        </aside>

        <section className="md:w-3/4 w-full px-4 space-y-8">
          {chapters.map((ch, i) => (
            <div key={i} id={`chapter-${i}`}>
              <h3 className={cn(
                "text-xl font-semibold mb-3",
                isDarkMode ? "text-white" : "text-zinc-900"
              )}>
                {ch.title || `Chapter ${i + 1}`}
              </h3>
              <div
                className={cn(
                  "prose max-w-none",
                  isDarkMode ? "prose-invert" : ""
                )}
                dangerouslySetInnerHTML={{ 
                  __html: generateProgressiveReadingHTML(getChapterText(i)) 
                }}
              />
            </div>
          ))}
        </section>
      </div>
    );
  };

  // Generate progressive reading HTML
  const generateProgressiveReadingHTML = (text: string): string => {
    if (!text) return "";
    
    const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [];

    return `
      <div class="space-y-2 text-base leading-relaxed">
        ${sentences.map((sentence, i) => `
          <p class="${i % 2 === 0 
            ? isDarkMode ? "text-white" : "text-black" 
            : isDarkMode ? "text-gray-400" : "text-gray-400"
          } ${i % 2 === 0 
            ? isDarkMode ? "bg-gray-800/50" : "bg-yellow-50"
            : isDarkMode ? "bg-gray-900/50" : "bg-blue-50"
          } p-3 rounded-lg">
            ${sentence.trim()}
          </p>
        `).join('')}
      </div>
    `;
  };

  // Main view renderer
  const renderView = () => {
    if (loading) return <Loader label="Processing your file..." />;
    if (!file && !inputText) return <p className="text-gray-400">Upload a textbook to get started.</p>;

    switch (viewMode) {
      case "original":
        return (
          <ScrollArea className="h-[80vh] border rounded p-4" ref={scrollRef}>
            {extension === "pdf" && pdfURL && (
              <PDFViewer fileUrl={pdfURL} initialScale={1.2} />
            )}
            {(extension === "txt" || inputText) && (
              <pre 
                className="whitespace-pre-wrap text-sm"
                style={{ 
                  fontFamily: fontFamily,
                  fontSize: `${fontSize}px`,
                  lineHeight: lineSpacing
                }}
              >
                {originalText || ""}
              </pre>
            )}
            {extension === "docx" && originalText && (
              <div 
                dangerouslySetInnerHTML={{ __html: originalText }}
                style={{ 
                  fontFamily: fontFamily,
                  fontSize: `${fontSize}px`,
                  lineHeight: lineSpacing
                }}
              />
            )}
          </ScrollArea>
        );
      case "chapters":
        return renderProgressiveChapters();
      case "progressive":
        return renderProgressiveReading();
      case "hybrid":
        return (
          <div className="grid md:grid-cols-2 gap-6">
            {pdfURL ? (
              <div className="border rounded overflow-hidden">
                <PDFViewer fileUrl={pdfURL} />
              </div>
            ) : (
              <div className={cn(
                "border rounded p-4",
                isDarkMode ? "bg-zinc-900" : "bg-white"
              )}>
                <pre 
                  className="whitespace-pre-wrap text-sm"
                  style={{ 
                    fontFamily: fontFamily,
                    fontSize: `${fontSize}px`,
                    lineHeight: lineSpacing
                  }}
                >
                  {originalText || ""}
                </pre>
              </div>
            )}
            <ScrollArea className={cn(
              "h-[80vh] border rounded p-4",
              isDarkMode ? "bg-zinc-900" : "bg-white"
            )}>
              <div
                ref={contentRef}
                className={cn(
                  "prose max-w-none",
                  isDarkMode ? "prose-invert" : ""
                )}
                style={{ 
                  fontFamily: fontFamily,
                  fontSize: `${fontSize}px`,
                  lineHeight: lineSpacing
                }}
                dangerouslySetInnerHTML={{ __html: hybridHTML || "" }}
              />
            </ScrollArea>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <main className={cn(
      "p-6 max-w-6xl mx-auto",
      isDarkMode ? "text-white" : "text-zinc-900"
    )}>
      <header className="mb-6 text-center">
        <h1 className="text-4xl font-bold text-pink-500">Thought-Unit Reader</h1>
        <p className="text-sm text-gray-300">Read deeper, faster, and smarter.</p>
      </header>

      <div className="flex justify-between items-center mb-6">
        <div>
          <Label className="block mb-2">Upload a file (PDF, DOCX, or TXT):</Label>
          <input
            type="file"
            accept=".pdf,.docx,.txt"
            ref={fileRef}
            className="mb-4"
            onChange={handleFileChange}
          />
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-sm">Dark Mode:</span>
          <button 
            onClick={toggleDarkMode}
            className={`w-12 h-6 rounded-full relative ${
              isDarkMode ? 'bg-blue-600' : 'bg-gray-300'
            }`}
          >
            <span 
              className={`absolute w-5 h-5 rounded-full bg-white top-0.5 transition-all ${
                isDarkMode ? 'left-6' : 'left-1'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mt-2 mb-6">
        <Button 
          onClick={() => setViewMode("original")} 
          variant={viewMode === "original" ? "default" : "secondary"}
        >
          📄 Original View
        </Button>
        <Button 
          onClick={() => setViewMode("chapters")} 
          variant={viewMode === "chapters" ? "default" : "outline"}
        >
          📚 Chapters
        </Button>
        <Button 
          onClick={() => setViewMode("progressive")} 
          variant={viewMode === "progressive" ? "default" : "outline"}
        >
          🧠 Progressive
        </Button>
        <Button 
          onClick={() => setViewMode("hybrid")} 
          variant={viewMode === "hybrid" ? "default" : "outline"}
        >
          🔁 Hybrid View
        </Button>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Label className="text-sm">Font:</Label>
          <select 
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            className={cn(
              "px-2 py-1 rounded border text-sm",
              isDarkMode ? "bg-gray-800 border-gray-600" : "bg-white border-gray-300"
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
          <span className="text-sm w-8 text-center">{fontSize}</span>
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
          <Label className="text-sm">Spacing:</Label>
          <Button 
            onClick={() => setLineSpacing(Math.max(lineSpacing - 0.1, 1.0))}
            variant="outline"
            size="sm"
            className="h-8 px-2"
          >
            -
          </Button>
          <span className="text-sm w-8 text-center">{lineSpacing.toFixed(1)}</span>
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

      <section className={cn(
        "mt-4",
        isDarkMode ? "bg-gray-900" : ""
      )}>
        {renderView()}
      </section>
    </main>
  );
}