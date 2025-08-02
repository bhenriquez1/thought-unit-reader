// components/HybridReader.tsx - Enhanced with Progressive Reading
"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/classnames";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import Loader from "./ui/loader";

// Import utilities with correct paths
import {
  parseBookWithChapters,
  generateHybridHTML,
  parseTextToUnits,
} from "../lib/parser";

// Define the Chapter interface
interface Chapter {
  title: string;
  content: string;
  page?: number;
}

// Use dynamic import for PDFViewer
import dynamic from "next/dynamic";

const PDFViewer = dynamic(() => import("./PDFViewer"), {
  ssr: false,
  loading: () => <Loader label="Loading PDF viewer..." />
});

interface HybridReaderProps {
  inputText?: string;
  darkMode?: boolean;
  fontFamily?: string;
  fontSize?: number;
  lineSpacing?: number;
}

/**
 * Enhanced HybridReader with Progressive Reading Controls
 */
export default function HybridReader({ 
  inputText,
  darkMode = false,
  fontFamily = "Arial, sans-serif",
  fontSize = 18,
  lineSpacing = 1.8
}: HybridReaderProps) {
  // Refs for content and scroll handling
  const fileRef = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const currentWordRef = useRef<HTMLSpanElement | null>(null);

  // File and content state
  const [file, setFile] = useState<File | null>(null);
  const [extension, setExtension] = useState<string>("");
  const [pdfURL, setPdfURL] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"original" | "chapters" | "progressive" | "hybrid">("hybrid");

  // Parsed content state
  const [parsedUnits, setParsedUnits] = useState<string[][]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [originalText, setOriginalText] = useState<string | null>(null);
  const [hybridHTML, setHybridHTML] = useState<string | null>(null);
  const [activeChapter, setActiveChapter] = useState(0);

  // Progressive reading state - NEW
  const [words, setWords] = useState<string[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const [wpm, setWpm] = useState(200);
  const [progress, setProgress] = useState(0);

  // Process input text and extract words for progressive reading
  useEffect(() => {
    if (inputText && !file && !loading) {
      setLoading(true);
      try {
        const units = parseTextToUnits(inputText);
        setParsedUnits(units);
        
        // Extract individual words for progressive reading
        const allWords = inputText
          .split(/\s+/)
          .map(word => word.trim())
          .filter(Boolean);
        setWords(allWords);
        
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

  // Progressive reading auto-advance
  useEffect(() => {
    if (!isReading || words.length === 0) return;
    
    const intervalTime = (60 * 1000) / wpm;
    
    const timer = setTimeout(() => {
      if (currentWordIndex < words.length - 1) {
        setCurrentWordIndex(prev => {
          const newIndex = prev + 1;
          setProgress((newIndex / (words.length - 1)) * 100);
          return newIndex;
        });
      } else {
        setIsReading(false);
      }
    }, intervalTime);
    
    return () => clearTimeout(timer);
  }, [currentWordIndex, isReading, words.length, wpm]);

  // Auto-scroll to current word
  useEffect(() => {
    if (isReading && currentWordRef.current) {
      currentWordRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [currentWordIndex, isReading]);

  // Progressive reading controls
  const toggleReading = () => setIsReading(!isReading);
  const resetReading = () => {
    setCurrentWordIndex(0);
    setProgress(0);
    setIsReading(false);
  };
  const adjustWpm = (delta: number) => {
    setWpm(prev => Math.max(50, Math.min(800, prev + delta)));
  };

  // Calculate time remaining
  const getTimeRemaining = () => {
    const wordsLeft = words.length - currentWordIndex - 1;
    const secondsLeft = Math.ceil((wordsLeft * 60) / wpm);
    
    if (secondsLeft < 60) return `${secondsLeft}s`;
    
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    return `${minutes}m ${seconds}s`;
  };

  // File upload handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const uploadedFile = files[0];
    if (!uploadedFile) return;
    
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
          
          // Extract words for progressive reading
          const allWords = original
            .split(/\s+/)
            .map(word => word.trim())
            .filter(Boolean);
          setWords(allWords);
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

  // Render progressive reading interface
  const renderProgressiveInterface = () => (
    <div className={cn(
      "p-6 rounded-lg mb-6",
      darkMode ? "bg-gray-800" : "bg-pink-50"
    )}>
      {/* Header */}
      <div className={cn(
        "flex items-center mb-4",
        darkMode ? "text-yellow-300" : "text-yellow-600"
      )}>
        <span className="text-xl mr-3">⚡</span>
        <h3 className="text-lg font-semibold">Hybrid Reading Controls</h3>
      </div>
      
      {/* Control Buttons */}
      <div className="flex gap-3 mb-4">
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
          <span className="text-sm">Speed:</span>
          <Button 
            onClick={() => adjustWpm(-25)}
            variant="outline"
            size="sm"
          >
            -
          </Button>
          <span className="text-sm w-16 text-center">{wpm} WPM</span>
          <Button 
            onClick={() => adjustWpm(25)}
            variant="outline"
            size="sm"
          >
            +
          </Button>
        </div>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className={cn(
          "p-3 rounded text-center",
          darkMode ? "bg-blue-900/30" : "bg-blue-100"
        )}>
          <div className={cn(
            "text-xl font-bold",
            darkMode ? "text-blue-300" : "text-blue-600"
          )}>
            {Math.round(progress)}%
          </div>
          <div className={cn(
            "text-xs",
            darkMode ? "text-blue-300" : "text-blue-600"
          )}>
            Complete
          </div>
        </div>
        
        <div className={cn(
          "p-3 rounded text-center",
          darkMode ? "bg-green-900/30" : "bg-green-100"
        )}>
          <div className={cn(
            "text-xl font-bold",
            darkMode ? "text-green-300" : "text-green-600"
          )}>
            {currentWordIndex + 1}
          </div>
          <div className={cn(
            "text-xs",
            darkMode ? "text-green-300" : "text-green-600"
          )}>
            Current
          </div>
        </div>
        
        <div className={cn(
          "p-3 rounded text-center",
          darkMode ? "bg-purple-900/30" : "bg-purple-100"
        )}>
          <div className={cn(
            "text-xl font-bold",
            darkMode ? "text-purple-300" : "text-purple-600"
          )}>
            {wpm}
          </div>
          <div className={cn(
            "text-xs",
            darkMode ? "text-purple-300" : "text-purple-600"
          )}>
            WPM
          </div>
        </div>
        
        <div className={cn(
          "p-3 rounded text-center",
          darkMode ? "bg-orange-900/30" : "bg-orange-100"
        )}>
          <div className={cn(
            "text-xl font-bold",
            darkMode ? "text-orange-300" : "text-orange-600"
          )}>
            {getTimeRemaining()}
          </div>
          <div className={cn(
            "text-xs",
            darkMode ? "text-orange-300" : "text-orange-600"
          )}>
            Left
          </div>
        </div>
      </div>
      
      {/* Progress Bar */}
      <div className={cn(
        "w-full h-2 rounded-full overflow-hidden",
        darkMode ? "bg-gray-700" : "bg-gray-200"
      )}>
        <div 
          className="h-full bg-yellow-400 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );

  // Render progressive reading area
  const renderProgressiveReading = () => (
    <div 
      className={cn(
        "p-6 rounded-lg shadow-inner mb-4 min-h-[200px] flex flex-wrap items-center justify-center",
        darkMode ? "bg-gray-900" : "bg-white"
      )}
      style={{ 
        fontFamily,
        fontSize: `${fontSize + 2}px`,
        lineHeight: lineSpacing
      }}
    >
      {words.map((word, index) => (
        <span 
          key={index}
          ref={index === currentWordIndex ? currentWordRef : null}
          className={cn(
            "mx-1 my-1 px-2 py-1 rounded transition-all duration-300",
            index === currentWordIndex 
              ? "bg-yellow-300 text-black font-bold scale-110 shadow" 
              : index < currentWordIndex 
                ? darkMode ? "text-gray-500" : "text-gray-400"
                : darkMode ? "text-white" : "text-black"
          )}
        >
          {word}
        </span>
      ))}
    </div>
  );

  if (loading) return <Loader label="Processing your file..." />;
  if (!file && !inputText) return <p className="text-gray-400">Upload a textbook to get started.</p>;

  return (
    <div className="w-full">
      {/* Progressive Reading Interface */}
      {renderProgressiveInterface()}
      
      {/* Progressive Reading Area */}
      {renderProgressiveReading()}
      
      {/* Word Counter */}
      <div className="text-center mb-4">
        <span className={cn(
          "text-sm",
          darkMode ? "text-gray-300" : "text-gray-600"
        )}>
          Thought Unit {currentWordIndex + 1} of {words.length}
        </span>
      </div>
    </div>
  );
}