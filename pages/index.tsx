// pages/index.tsx - Enhanced Book Reader with Complete Features
import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

// Type definitions
type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "none";
type ViewMode = "original" | "chapters" | "progressive" | "hybrid";
type Theme = "light" | "dark";

// Parse book with chapters function
const parseBookWithChapters = (text: string, title: string) => {
  const chapters: any[] = [];
  const chapterRegex = /^(chapter|CHAPTER|Chapter|chap|Chap|CHAP|ch|Ch|CH)\.?\s+(\d+|[IVXLCDM]+|\w+)(?:\s*[:\-—.]?\s*(.*))?$/im;
  const lines = text.split('\n');
  
  let currentChapter: any = null;
  let currentContent: string[] = [];
  const chapterNumbers = new Set<string>();
  let lastChapterEnd = -1;
  
  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    const match = trimmedLine.match(chapterRegex);
    
    if (match && index > lastChapterEnd + 2) {
      const chapterNum = match[2].toUpperCase();
      const chapterTitle = match[3] || '';
      
      if (!chapterNumbers.has(chapterNum)) {
        chapterNumbers.add(chapterNum);
        
        if (currentChapter && currentContent.length > 0) {
          const content = currentContent.join('\n').trim();
          if (content.length > 50) {
            currentChapter.content = content;
            chapters.push(currentChapter);
            lastChapterEnd = index - 1;
          }
        }
        
        currentChapter = {
          id: `chapter-${chapterNum}`,
          number: chapterNum,
          title: chapterTitle.trim() || `Chapter ${chapterNum}`,
          content: '',
          units: []
        };
        currentContent = [];
      }
    } else if (trimmedLine && (!match || index <= lastChapterEnd + 2)) {
      currentContent.push(line);
    }
  });
  
  if (currentChapter && currentContent.length > 0) {
    const content = currentContent.join('\n').trim();
    if (content.length > 50) {
      currentChapter.content = content;
      chapters.push(currentChapter);
    }
  }
  
  if (chapters.length === 0) {
    chapters.push({
      id: 'chapter-full',
      number: '1',
      title: title,
      content: text,
      units: []
    });
  }
  
  return {
    title,
    chapters,
    totalUnits: 0
  };
};

export default function Home() {
  // Core states
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("hybrid");
  const [bookStructure, setBookStructure] = useState<any>(null);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [theme, setTheme] = useState<Theme>("light");
  
  // PDF-specific states
  const [fileType, setFileType] = useState<FileType>("none");
  const [pdfFile, setPdfFile] = useState<Blob | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [fileName, setFileName] = useState("");
  const [pdfScale, setPdfScale] = useState(1.0);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // Hybrid reader states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [chunkSpeed, setChunkSpeed] = useState(2000);
  const [wordSpeed, setWordSpeed] = useState(300);
  const [maxChunkSize, setMaxChunkSize] = useState(5);
  const [showSettings, setShowSettings] = useState(false);
  const [wpm, setWpm] = useState(200);
  const [showTOC, setShowTOC] = useState(false);
  const [pdfTOC, setPdfTOC] = useState<any[] | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showPageNav, setShowPageNav] = useState(false);
  
  // Navigation states
  const [thoughtUnits, setThoughtUnits] = useState<string[]>([]);
  const [highlightPosition, setHighlightPosition] = useState<{start: number, end: number} | null>(null);
  
  // Refs
  const chunkTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wordTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // Pan and zoom states
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [scrollStart, setScrollStart] = useState({ x: 0, y: 0 });

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Calculate reading speeds based on WPM
  useEffect(() => {
    const wordMs = (60 / wpm) * 1000;
    setWordSpeed(wordMs);
    setChunkSpeed(wordMs * maxChunkSize * 1.5);
  }, [wpm, maxChunkSize]);

  // Preprocess text to remove duplicate chapters
  const preprocessTextForDuplicates = (text: string): string => {
    const lines = text.split('\n');
    const chapterRegex = /^(chapter|CHAPTER|Chapter|chap|Chap|CHAP|ch|Ch|CH)\.?\s+(\d+|[IVXLCDM]+|\w+)(?:\s*[:\-—.]?\s*(.*))?$/im;
    const seenChapters = new Set<string>();
    const filteredLines: string[] = [];
    let lastChapterLine = -1;
    
    lines.forEach((line, index) => {
      const match = line.trim().match(chapterRegex);
      
      if (match) {
        const chapterNum = match[2].toUpperCase();
        
        if (seenChapters.has(chapterNum) && index - lastChapterLine < 50) {
          return;
        }
        
        seenChapters.add(chapterNum);
        lastChapterLine = index;
      }
      
      filteredLines.push(line);
    });
    
    return filteredLines.join('\n');
  };

  // Enhanced text chunking for optimal comprehension
  const createThoughtUnits = useCallback((inputText: string) => {
    if (!inputText) {
      setThoughtUnits([]);
      return [];
    }
    
    const cleanText = inputText.replace(/\s+/g, ' ').trim();
    const sentences = cleanText.match(/[^\.!?]+[\.!?]+/g) || [cleanText];
    const chunks: string[] = [];
    
    const breakWords = ['and', 'or', 'but', 'because', 'however', 'therefore', 'meanwhile', 'furthermore', 'moreover', 'consequently', 'although', 'though', 'while', 'when', 'if', 'unless', 'since', 'so'];
    const prepositions = ['in', 'on', 'at', 'by', 'for', 'with', 'from', 'to', 'of', 'about', 'through', 'during', 'before', 'after', 'under', 'over'];
    const conjunctions = ['that', 'which', 'who', 'whom', 'whose', 'where', 'when'];
    
    sentences.forEach(sentence => {
      const words = sentence.trim().split(/\s+/).filter(word => word.length > 0);
      let currentChunk: string[] = [];
      
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const nextWord = words[i + 1]?.toLowerCase();
        const prevWord = words[i - 1]?.toLowerCase();
        
        currentChunk.push(word);
        
        const optimalSize = maxChunkSize;
        const minSize = Math.max(2, optimalSize - 2);
        const maxSize = optimalSize + 1;
        
        const atOptimalSize = currentChunk.length >= optimalSize;
        const atMinSize = currentChunk.length >= minSize;
        const atMaxSize = currentChunk.length >= maxSize;
        const hasPunctuation = word.match(/[,;:—–]/);
        const hasQuotePunctuation = word.match(/["""'']/);
        const beforeBreakWord = breakWords.includes(nextWord);
        const afterPreposition = prepositions.includes(prevWord);
        const beforeConjunction = conjunctions.includes(nextWord);
        const isLastWord = i === words.length - 1;
        
        const shouldBreak = 
          atMaxSize || 
          isLastWord || 
          (atOptimalSize && (hasPunctuation || beforeBreakWord || beforeConjunction)) ||
          (atMinSize && hasQuotePunctuation) ||
          (currentChunk.length >= 4 && afterPreposition && beforeBreakWord);
          
        if (shouldBreak) {
          const chunk = currentChunk.join(' ');
          if (chunk.trim()) {
            chunks.push(chunk);
          }
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
    if (inputText && !bookStructure) {
      createThoughtUnits(inputText);
    }
  }, [inputText, bookStructure, createThoughtUnits]);

  // Smart zoom handler for PDF with panning
  const handlePdfZoom = useCallback((delta: number, e?: React.WheelEvent<HTMLDivElement>) => {
    const newScale = Math.max(0.5, Math.min(3.0, pdfScale + delta));
    setPdfScale(newScale);
  }, [pdfScale]);

  // Enable PDF panning when zoomed
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (pdfScale > 1.0 && pdfContainerRef.current) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setScrollStart({ 
        x: pdfContainerRef.current.scrollLeft, 
        y: pdfContainerRef.current.scrollTop 
      });
      e.preventDefault();
    }
  }, [pdfScale]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging && pdfContainerRef.current) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      pdfContainerRef.current.scrollLeft = scrollStart.x - dx;
      pdfContainerRef.current.scrollTop = scrollStart.y - dy;
    }
  }, [isDragging, dragStart, scrollStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Extract TOC from PDF
  const extractTOCFromPDF = useCallback(async (pdfDoc: any) => {
    try {
      const outline = await pdfDoc.getOutline();
      if (!outline) return null;
      
      const processTOCItems = async (items: any[], level: number = 0): Promise<any[]> => {
        const tocItems = [];
        for (const item of items) {
          let pageNumber = null;
          try {
            if (item.dest) {
              const dest = await pdfDoc.getDestination(item.dest);
              if (dest) {
                pageNumber = (await pdfDoc.getPageIndex(dest[0])) + 1;
              }
            }
          } catch (e) {
            console.warn('Could not resolve destination:', e);
          }
          
          tocItems.push({
            title: item.title,
            pageNumber,
            level,
            items: item.items ? await processTOCItems(item.items, level + 1) : []
          });
        }
        return tocItems;
      };
      
      return await processTOCItems(outline);
    } catch (err) {
      console.warn('Could not extract PDF TOC:', err);
      return null;
    }
  }, []);

  // Helper to extract text from PDF with TOC
  const extractTextFromPDF = useCallback(async (buffer: ArrayBuffer): Promise<{ text: string, toc: any[] | null }> => {
    try {
      const pdf = await pdfjs.getDocument({ 
        data: buffer,
        cMapUrl: `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/cmaps/`,
        cMapPacked: true,
      }).promise;
      
      let toc = null;
      try {
        toc = await extractTOCFromPDF(pdf);
      } catch (tocError) {
        console.warn('TOC extraction failed:', tocError);
      }
      
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
      return { text: fullText.trim(), toc };
    } catch (err) {
      console.error("PDF extraction error:", err);
      throw new Error(`Failed to extract text from PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [extractTOCFromPDF]);

  // Enhanced text area word click handler
  const handleTextAreaClick = useCallback((e: React.MouseEvent<HTMLTextAreaElement>) => {
    if (!textAreaRef.current || thoughtUnits.length === 0) return;
    
    const textarea = textAreaRef.current;
    const clickPosition = textarea.selectionStart;
    
    const text = textarea.value;
    let wordStart = clickPosition;
    let wordEnd = clickPosition;
    
    while (wordStart > 0 && !/\s/.test(text[wordStart - 1])) {
      wordStart--;
    }
    while (wordEnd < text.length && !/\s/.test(text[wordEnd])) {
      wordEnd++;
    }
    
    const clickedWord = text.substring(wordStart, wordEnd).replace(/[.,!?;:'"]/g, '').trim();
    
    if (clickedWord && clickedWord.length > 0) {
      const textBeforeWord = text.substring(0, wordStart);
      const wordsBeforeClick = textBeforeWord.split(/\s+/).filter(w => w.length > 0).length;
      
      let totalWordsSeen = 0;
      let found = false;
      
      for (let i = 0; i < thoughtUnits.length; i++) {
        const unitWords = thoughtUnits[i].split(/\s+/).filter(w => w.length > 0);
        const unitWordCount = unitWords.length;
        
        if (wordsBeforeClick >= totalWordsSeen && wordsBeforeClick < totalWordsSeen + unitWordCount) {
          setCurrentChunkIndex(i);
          
          const wordIndexInUnit = wordsBeforeClick - totalWordsSeen;
          setCurrentWordIndex(Math.max(0, Math.min(wordIndexInUnit, unitWords.length - 1)));
          
          if (isPlaying) {
            setIsPlaying(false);
          }
          found = true;
          break;
        }
        
        totalWordsSeen += unitWordCount;
      }
      
      if (!found) {
        const clickedWordClean = clickedWord.toLowerCase();
        for (let i = 0; i < thoughtUnits.length; i++) {
          const unitWords = thoughtUnits[i].toLowerCase().replace(/[.,!?;:'"]/g, '').split(/\s+/);
          
          for (let j = 0; j < unitWords.length; j++) {
            if (unitWords[j] === clickedWordClean || unitWords[j].includes(clickedWordClean)) {
              setCurrentChunkIndex(i);
              setCurrentWordIndex(j);
              if (isPlaying) {
                setIsPlaying(false);
              }
              found = true;
              break;
            }
          }
          if (found) break;
        }
      }
    }
  }, [thoughtUnits, isPlaying]);

  // Handle TOC navigation
  const handleTOCClick = useCallback((chapterIndex: number) => {
    if (!bookStructure || !bookStructure.chapters[chapterIndex]) return;
    
    let targetUnitIndex = 0;
    for (let i = 0; i < chapterIndex; i++) {
      targetUnitIndex += bookStructure.chapters[i].units.length;
    }
    
    setCurrentChunkIndex(targetUnitIndex);
    setCurrentWordIndex(0);
    setCurrentChapter(chapterIndex);
    
    if (isPlaying) {
      setIsPlaying(false);
    }
    
    if (window.innerWidth < 1024) {
      setShowTOC(false);
    }
    
    setTimeout(() => {
      const chapterElement = document.getElementById(`chapter-${bookStructure.chapters[chapterIndex].id}`);
      if (chapterElement) {
        chapterElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }, [bookStructure, isPlaying]);

  // Enhanced PDF page navigation
  const handlePdfPageClick = useCallback((pageNumber: number) => {
    if (thoughtUnits.length === 0 || numPages === 0) return;
    
    const progressThroughBook = (pageNumber - 1) / numPages;
    const targetUnitIndex = Math.floor(progressThroughBook * thoughtUnits.length);
    const clampedIndex = Math.max(0, Math.min(targetUnitIndex, thoughtUnits.length - 1));
    
    setCurrentChunkIndex(clampedIndex);
    setCurrentWordIndex(0);
    if (isPlaying) {
      setIsPlaying(false);
    }
  }, [thoughtUnits.length, numPages, isPlaying]);

  // Get current chapter info
  const getCurrentChapterInfo = useCallback(() => {
    if (!bookStructure) return null;
    
    let globalIndex = 0;
    for (let i = 0; i < bookStructure.chapters.length; i++) {
      const chapter = bookStructure.chapters[i];
      if (currentChunkIndex >= globalIndex && currentChunkIndex < globalIndex + chapter.units.length) {
        return {
          chapter,
          chapterIndex: i,
          unitInChapter: currentChunkIndex - globalIndex + 1
        };
      }
      globalIndex += chapter.units.length;
    }
    return null;
  }, [bookStructure, currentChunkIndex]);

  // Track current page on scroll
  useEffect(() => {
    if (fileType === "pdf" && pdfContainerRef.current && numPages > 0) {
      const container = pdfContainerRef.current;
      
      const handleScroll = () => {
        const pages = container.querySelectorAll('[id^="pdf-page-"]');
        const containerRect = container.getBoundingClientRect();
        const centerY = containerRect.top + containerRect.height / 2;
        
        for (let i = 0; i < pages.length; i++) {
          const pageRect = pages[i].getBoundingClientRect();
          if (pageRect.top <= centerY && pageRect.bottom >= centerY) {
            const pageNum = parseInt(pages[i].id.split('-')[2]);
            if (pageNum !== currentPage) {
              setCurrentPage(pageNum);
            }
            break;
          }
        }
      };
      
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [fileType, currentPage, numPages]);

  // Sync current position when chunk changes
  useEffect(() => {
    if (!inputText || thoughtUnits.length === 0 || !textAreaRef.current) return;
    
    const currentUnit = thoughtUnits[currentChunkIndex];
    if (!currentUnit) return;
    
    const unitStart = inputText.toLowerCase().indexOf(currentUnit.toLowerCase());
    if (unitStart !== -1) {
      const unitEnd = unitStart + currentUnit.length;
      setHighlightPosition({ start: unitStart, end: unitEnd });
      
      requestAnimationFrame(() => {
        if (textAreaRef.current && document.activeElement !== textAreaRef.current) {
          textAreaRef.current.setSelectionRange(unitStart, unitEnd);
          
          const textarea = textAreaRef.current;
          const totalHeight = textarea.scrollHeight;
          const visibleHeight = textarea.clientHeight;
          const scrollPosition = (unitStart / inputText.length) * totalHeight;
          textarea.scrollTop = Math.max(0, scrollPosition - visibleHeight / 2);
        }
      });
    }
  }, [currentChunkIndex, thoughtUnits, inputText]);

  // Sync PDF page when chunk changes
  useEffect(() => {
    if (fileType === "pdf" && numPages > 0 && thoughtUnits.length > 0) {
      const progress = currentChunkIndex / thoughtUnits.length;
      const targetPage = Math.floor(progress * numPages) + 1;
      
      if (pdfContainerRef.current) {
        const pageElement = document.getElementById(`pdf-page-${targetPage}`);
        if (pageElement) {
          pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [currentChunkIndex, thoughtUnits.length, numPages, fileType]);

  // Get current chapter info
  const getCurrentChapterInfo = useCallback(() => {
    if (!bookStructure) return null;
    
    let globalIndex = 0;
    for (let i = 0; i < bookStructure.chapters.length; i++) {
      const chapter = bookStructure.chapters[i];
      if (currentChunkIndex >= globalIndex && currentChunkIndex < globalIndex + chapter.units.length) {
        return {
          chapter,
          chapterIndex: i,
          unitInChapter: currentChunkIndex - globalIndex + 1
        };
      }
      globalIndex += chapter.units.length;
    }
    return null;
  }, [bookStructure, currentChunkIndex]);

  const currentChapterInfo = getCurrentChapterInfo();

  // Get current chunk words
  const getCurrentChunkWords = () => {
    if (currentChunkIndex >= thoughtUnits.length) return [];
    return thoughtUnits[currentChunkIndex].split(/\s+/);
  };

  const currentWords = getCurrentChunkWords();

  // Advanced timer management
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
  }, [isPlaying, currentChunkIndex, currentWords.length, thoughtUnits.length, chunkSpeed, wordSpeed, viewMode]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentChunkIndex(0);
    setCurrentWordIndex(0);
    setHighlightPosition(null);
  };

  const handleChunkClick = (chunkIndex: number) => {
    setCurrentChunkIndex(chunkIndex);
    setCurrentWordIndex(0);
    if (isPlaying) {
      setIsPlaying(false);
      setTimeout(() => setIsPlaying(true), 100);
    }
  };

  // Handle text input change
  const handleTextChange = useCallback((text: string) => {
    setInputText(text);
    setError(null);
    setFileType("text");
    setOutput(null);
    setBookStructure(null);
    setHighlightPosition(null);
    setCurrentChunkIndex(0);
    setCurrentWordIndex(0);
    setIsPlaying(false);
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
    setPdfTOC(null);
    setCurrentPage(1);
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
        const result = await extractTextFromPDF(buffer);
        extractedText = result.text;
        setPdfTOC(result.toc);
        
        if (result.toc && result.toc.length > 0) {
          console.log('PDF TOC found:', result.toc);
        }
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
  }, [extractTextFromPDF, handleReset]);

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

    setTimeout(() => {
      try {
        const bookTitle = fileName.replace(/\.(pdf|txt)$/i, '') || "Untitled Book";
        
        const cleanedText = preprocessTextForDuplicates(inputText);
        
        const structure = parseBookWithChapters(cleanedText, bookTitle);
        
        let unitId = 1;
        structure.chapters.forEach((chapter: any) => {
          const chapterUnits = createThoughtUnits(chapter.content);
          chapter.units = chapterUnits.map((unit, index) => ({
            id: `unit-${unitId++}`,
            unitNumber: index + 1,
            text: unit
          }));
        });
        
        structure.totalUnits = structure.chapters.reduce((sum: number, ch: any) => sum + ch.units.length, 0);
        
        setBookStructure(structure);
        
        const allUnits: string[] = [];
        structure.chapters.forEach((chapter: any) => {
          chapter.units.forEach((unit: any) => {
            allUnits.push(unit.text);
          });
        });
        setThoughtUnits(allUnits);
        
        setViewMode("hybrid");
        setLoading(false);

      } catch (err) {
        console.error("Parsing error:", err);
        setError("Failed to create thought units. Please try again.");
        setLoading(false);
      }
    }, 100);
  }, [enabled, inputText, fileName, createThoughtUnits]);

  const totalWords = thoughtUnits.join(' ').split(/\s+/).length;
  const wordsRead = thoughtUnits.slice(0, currentChunkIndex + 1).join(' ').split(/\s+/).length;
  const percentComplete = totalWords > 0 ? Math.round((wordsRead / totalWords) * 100) : 0;
  const estimatedTime = totalWords > 0 ? Math.round((totalWords - wordsRead) / (wpm / 60)) : 0;

  const getStatusColor = (status: UploadStatus) => {
    switch (status) {
      case "uploading": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "processing": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "done": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "error": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
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
        <div key={chapter.id || `chapter-${chapterIndex}-${chapter.number}`} className="mb-6" id={`chapter-${chapter.id}`}>
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900 dark:to-purple-900 border border-indigo-200 dark:border-indigo-700 rounded-lg p-3 mb-3">
            <div className="flex items-center justify-between">
              <h5 className="font-bold text-indigo-800 dark:text-indigo-200 text-sm flex items-center">
                <span className="bg-indigo-600 dark:bg-indigo-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold mr-2">
                  {chapter.number}
                </span>
                {chapter.title}
              </h5>
              <div className="text-xs text-indigo-600 dark:text-indigo-300 bg-white dark:bg-gray-800 px-2 py-1 rounded-full">
                {chapter.units.length} units
              </div>
            </div>
          </div>
          
          <div className="space-y-2 pl-4">
            {chapter.units.map((unit: any, unitIndex: number) => {
              const globalUnitIndex = chapterStartIndex + unitIndex;
              return (
                <button
                  key={`${chapter.id}-${unit.id}`}
                  onClick={() => handleChunkClick(globalUnitIndex)}
                  className={`w-full text-left p-2 rounded-lg transition-all text-xs ${
                    globalUnitIndex === currentChunkIndex
                      ? 'bg-blue-100 dark:bg-blue-900 border border-blue-400 dark:border-blue-600 text-blue-900 dark:text-blue-100 shadow-md'
                      : globalUnitIndex < currentChunkIndex
                      ? 'bg-green-50 dark:bg-green-900 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-bold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded flex-shrink-0">
                      {unit.unitNumber}
                    </span>
                    <span className="flex-1">{unit.text}</span>
                    {globalUnitIndex === currentChunkIndex && (
                      <span className="text-xs bg-blue-500 dark:bg-blue-600 text-white px-2 py-1 rounded flex-shrink-0">
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
    <div className={`min-h-screen transition-colors duration-300 ${theme === 'dark' ? 'dark' : ''}`} style={{ backgroundColor: theme === 'dark' ? '#0f0f0f' : '#f8fafc' }}>
      {/* Fixed Header */}
      <div className="bg-white dark:bg-gray-900 shadow-lg border-b dark:border-gray-800 sticky top-0 z-10 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-pink-400 to-red-400 rounded-xl flex items-center justify-center">
                <span className="text-2xl">🧠</span>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Thought Unit Reader</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Transform any book into thought-units for enhanced comprehension
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="Toggle theme"
              >
                {theme === 'light' ? '🌙' : '☀️'}
              </button>
              
              {bookStructure && (
                <button
                  onClick={() => setShowTOC(!showTOC)}
                  className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  title="Toggle Table of Contents"
                >
                  📑
                </button>
              )}
              
              {bookStructure && (
                <div className="flex items-center space-x-2 border border-gray-300 dark:border-gray-600 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode("original")}
                    className={`px-3 py-1 text-xs rounded ${viewMode === "original" ? 'bg-blue-500 text-white' : 'text-gray-600 dark:text-gray-400'}`}
                  >
                    Original
                  </button>
                  <button
                    onClick={() => setViewMode("chapters")}
                    className={`px-3 py-1 text-xs rounded ${viewMode === "chapters" ? 'bg-blue-500 text-white' : 'text-gray-600 dark:text-gray-400'}`}
                  >
                    Chapters
                  </button>
                  <button
                    onClick={() => { setViewMode("hybrid"); handleReset(); }}
                    className={`px-3 py-1 text-xs rounded ${viewMode === "hybrid" ? 'bg-blue-500 text-white' : 'text-gray-600 dark:text-gray-400'}`}
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
                <Label htmlFor="toggleParser" className="text-sm font-medium dark:text-gray-300">
                  Analyzer {enabled ? 'ON' : 'OFF'}
                </Label>
              </div>
              
              {inputText.length > 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
                  📊 {Math.round(inputText.length / 5)} words
                  {fileName && <span className="ml-2">| 📄 {fileName.length > 20 ? fileName.substring(0, 20) + '...' : fileName}</span>}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <input
                type="file"
                accept=".pdf,.txt"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-600 dark:text-gray-400 file:mr-4 file:py-3 file:px-6 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 dark:file:bg-blue-900 file:text-blue-700 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-800 cursor-pointer border border-gray-300 dark:border-gray-600 rounded-lg p-2"
              />
            </div>
            
            <Button
              onClick={parseText}
              disabled={!enabled || !inputText.trim() || loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white font-semibold px-8 py-3 text-sm whitespace-nowrap rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
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

          {uploadStatus !== "idle" && (
            <div className={`p-3 rounded-lg mt-3 text-sm ${getStatusColor(uploadStatus)}`}>
              {getStatusMessage(uploadStatus)}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg mt-3 text-sm border border-red-200 dark:border-red-700">
              ⚠️ {error}
            </div>
          )}

          {thoughtUnits.length > 0 && (
            <div className="mt-3 p-3 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg text-sm text-green-800 dark:text-green-200">
              ✨ <strong>Navigation Features:</strong> 
              • Click any word to jump to exact position in thought units 
              • Use Ctrl+Scroll to zoom PDFs, then drag to pan when zoomed
              • Click 📑 for Table of Contents with PDF bookmarks
              • Use page navigation or click pages to jump
              • Optimal chunk size: 4-5 words for best comprehension
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className={`grid ${showTOC && bookStructure ? 'lg:grid-cols-[250px,2fr,1fr] grid-cols-1' : 'grid-cols-1 lg:grid-cols-[5fr,3fr]'} gap-6`} style={{ height: "calc(100vh - 200px)" }}>
          
          {/* TABLE OF CONTENTS PANEL */}
          {showTOC && bookStructure && (
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700 lg:relative fixed lg:inset-auto inset-0 lg:z-auto z-50">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900 dark:to-indigo-900 px-6 py-4 border-b dark:border-gray-700 flex-shrink-0">
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 flex items-center justify-between">
                  <span className="flex items-center">
                    📑 <span className="ml-2">Table of Contents</span>
                  </span>
                  <button
                    onClick={() => setShowTOC(false)}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    ✕
                  </button>
                </h2>
              </div>
              
              <div className="flex-1 overflow-auto p-4">
                <div className="space-y-2">
                  {pdfTOC && pdfTOC.length > 0 && (
                    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900 rounded-lg">
                      <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">
                        📄 PDF Bookmarks
                      </h4>
                      <div className="space-y-1 max-h-64 overflow-y-auto">
                        {(() => {
                          const flattenTOC = (items: any[], level: number = 0): any[] => {
                            return items.reduce((acc, item) => {
                              acc.push({ ...item, level });
                              if (item.items && item.items.length > 0) {
                                acc.push(...flattenTOC(item.items, level + 1));
                              }
                              return acc;
                            }, []);
                          };
                          const flatTOC = flattenTOC(pdfTOC);
                          
                          return flatTOC.map((item, index) => (
                            <button
                              key={`pdf-toc-${index}`}
                              onClick={() => {
                                if (item.pageNumber) {
                                  setCurrentPage(item.pageNumber);
                                  const pageElement = document.getElementById(`pdf-page-${item.pageNumber}`);
                                  if (pageElement) {
                                    pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  }
                                }
                              }}
                              className="w-full text-left text-xs p-2 hover:bg-blue-100 dark:hover:bg-blue-800 rounded transition-colors"
                              style={{ paddingLeft: `${(item.level + 1) * 0.75}rem` }}
                            >
                              {item.title}
                              {item.pageNumber && (
                                <span className="text-gray-500 dark:text-gray-400 ml-2">
                                  (p. {item.pageNumber})
                                </span>
                              )}
                            </button>
                          ));
                        })()}
                      </div>
                    </div>
                  )}
                  
                  {bookStructure.chapters.map((chapter: any, index: number) => {
                    const isCurrentChapter = currentChapterInfo?.chapterIndex === index;
                    return (
                      <button
                        key={`toc-${chapter.id}`}
                        onClick={() => handleTOCClick(index)}
                        className={`w-full text-left p-3 rounded-lg transition-all ${
                          isCurrentChapter
                            ? 'bg-blue-100 dark:bg-blue-900 border-2 border-blue-400 dark:border-blue-600 shadow-md'
                            : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`text-lg font-bold ${
                            isCurrentChapter ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            {chapter.number}
                          </span>
                          <div className="flex-1">
                            <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">
                              {chapter.title}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {chapter.units.length} thought units
                            </div>
                            {isCurrentChapter && currentChapterInfo && (
                              <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                Reading unit {currentChapterInfo.unitInChapter} of {chapter.units.length}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                
                <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Reading Progress
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600 dark:text-gray-400">Total Chapters</span>
                      <span className="font-semibold">{bookStructure.chapters.length}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600 dark:text-gray-400">Total Units</span>
                      <span className="font-semibold">{bookStructure.totalUnits}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600 dark:text-gray-400">Completion</span>
                      <span className="font-semibold text-green-600 dark:text-green-400">{percentComplete}%</span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${percentComplete}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* LEFT PANEL - Original Content */}
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700">
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 px-6 py-4 border-b dark:border-gray-700 flex-shrink-0">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 flex items-center">
                  📄 <span className="ml-2">Original Content</span>
                  {numPages > 0 && (
                    <span className="ml-3 text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-3 py-1 rounded-full">
                      {numPages} pages
                    </span>
                  )}
                  {thoughtUnits.length > 0 && (
                    <span className="ml-3 text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900 px-2 py-1 rounded-full animate-pulse">
                      🔄 Click words to navigate!
                    </span>
                  )}
                </h2>
                
                {fileType === "pdf" && (
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 border-r pr-4 mr-2">
                      <button
                        onClick={() => {
                          const newPage = Math.max(1, currentPage - 1);
                          setCurrentPage(newPage);
                          const pageElement = document.getElementById(`pdf-page-${newPage}`);
                          if (pageElement) {
                            pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }}
                        disabled={currentPage <= 1}
                        className="px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-sm disabled:opacity-50"
                      >
                        ←
                      </button>
                      <input
                        type="number"
                        value={currentPage}
                        onChange={(e) => {
                          const page = parseInt(e.target.value) || 1;
                          const validPage = Math.max(1, Math.min(page, numPages));
                          setCurrentPage(validPage);
                          const pageElement = document.getElementById(`pdf-page-${validPage}`);
                          if (pageElement) {
                            pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }}
                        className="w-16 px-2 py-1 text-center border rounded text-sm dark:bg-gray-700 dark:border-gray-600"
                        min="1"
                        max={numPages}
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-400">/ {numPages}</span>
                      <button
                        onClick={() => {
                          const newPage = Math.min(numPages, currentPage + 1);
                          setCurrentPage(newPage);
                          const pageElement = document.getElementById(`pdf-page-${newPage}`);
                          if (pageElement) {
                            pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }}
                        disabled={currentPage >= numPages}
                        className="px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-sm disabled:opacity-50"
                      >
                        →
                      </button>
                    </div>
                    
                    <span className="text-xs text-gray-500 mr-2">Ctrl+Scroll to zoom • Drag to pan</span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">Zoom:</span>
                    <button
                      onClick={() => handlePdfZoom(-0.1)}
                      className="px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-sm"
                    >
                      -
                    </button>
                    <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[3rem] text-center">
                      {Math.round(pdfScale * 100)}%
                    </span>
                    <button
                      onClick={() => handlePdfZoom(0.1)}
                      className="px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-sm"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            <div 
              className="flex-1 overflow-auto" 
              ref={pdfContainerRef}
              onWheel={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  e.preventDefault();
                  const delta = e.deltaY > 0 ? -0.1 : 0.1;
                  handlePdfZoom(delta, e);
                }
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ cursor: isDragging ? 'grabbing' : (pdfScale > 1.0 ? 'grab' : 'default') }}
            >
              {fileType === "pdf" && pdfFile ? (
                <div className="p-4">
                  <Document
                    file={pdfFile}
                    onLoadError={(err) => {
                      console.error("PDF display error:", err);
                      setError(`PDF Display Error: ${err.message || 'Failed to display PDF'}`);
                    }}
                    onLoadSuccess={({ numPages: pages }) => {
                      setNumPages(pages);
                      console.log(`PDF loaded with ${pages} pages`);
                    }}
                    className="w-full"
                  >
                    {Array.from({ length: Math.min(numPages, 50) }).map((_, i) => {
                      const isCurrentPage = currentPage === i + 1;
                      return (
                        <div 
                          key={i} 
                          id={`pdf-page-${i + 1}`} 
                          className={`mb-4 bg-white dark:bg-gray-800 shadow-lg rounded-lg overflow-hidden border-2 transition-all ${
                            isCurrentPage 
                              ? 'border-blue-500 dark:border-blue-400 shadow-xl' 
                              : 'dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'
                          }`}
                        >
                          <div className="bg-gradient-to-r from-gray-100 to-blue-50 dark:from-gray-700 dark:to-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 font-medium flex justify-between items-center">
                            <span className="font-bold flex items-center gap-2">
                              <span className={`text-lg ${isCurrentPage ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                                📄
                              </span>
                              Page {i + 1}
                              {isCurrentPage && (
                                <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full ml-2">
                                  Current
                                </span>
                              )}
                            </span>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setCurrentPage(i + 1);
                                  handlePdfPageClick(i + 1);
                                }}
                                className="text-xs bg-blue-500 dark:bg-blue-600 text-white px-3 py-1 rounded-full hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors font-semibold shadow"
                              >
                                📍 Jump to Units
                              </button>
                            </div>
                          </div>
                          <div 
                            className="p-4 flex justify-center cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors" 
                            onClick={() => {
                              setCurrentPage(i + 1);
                              handlePdfPageClick(i + 1);
                            }}
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
                      );
                    })}
                    {numPages > 50 && (
                      <div className="text-center p-6 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg mt-4">
                        <div className="text-3xl mb-3">📚</div>
                        <p className="font-medium text-lg">... and {numPages - 50} more pages</p>
                        <p className="text-sm mt-2">Showing first 50 pages for performance</p>
                        <p className="text-xs mt-2 text-blue-600 dark:text-blue-400">
                          💡 All {numPages} pages are processed - click any visible page to navigate!
                        </p>
                      </div>
                    )}
                  </Document>
                </div>
              ) : inputText ? (
                <div className="p-6 h-full">
                  <div className="h-full flex flex-col">
                    <Label className="block text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300 flex items-center">
                      📝 Original Text (click any word to jump to it in units):
                      {highlightPosition && (
                        <span className="ml-2 text-xs bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded-full">
                          Current unit highlighted!
                        </span>
                      )}
                    </Label>
                    <textarea
                      ref={textAreaRef}
                      value={inputText}
                      onChange={(e) => handleTextChange(e.target.value)}
                      onClick={handleTextAreaClick}
                      placeholder="Paste your text here or upload a PDF file..."
                      className="flex-1 w-full p-4 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-sm leading-relaxed resize-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 transition-colors duration-200 cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 dark:bg-gray-800 dark:text-gray-200"
                      style={{ 
                        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                        backgroundColor: highlightPosition ? (theme === 'dark' ? '#1f2937' : '#fffbeb') : (theme === 'dark' ? '#1f2937' : 'white')
                      }}
                      title="Click any word to jump to it in the thought units"
                    />
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col justify-center items-center text-gray-500 dark:text-gray-400 p-8">
                  <div className="text-6xl mb-6">📚</div>
                  <p className="text-xl font-semibold text-center mb-2">Upload any book or document</p>
                  <p className="text-sm text-center text-gray-400 dark:text-gray-500 max-w-md mb-4">
                    Experience seamless bidirectional navigation between original content and thought units.
                  </p>
                  <div className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                    <strong>Supported:</strong> PDF files up to 500MB, TXT files
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANEL - Thought Units */}
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700">
            <div className="bg-gradient-to-r from-pink-50 to-red-50 dark:from-pink-900 dark:to-red-900 px-6 py-4 border-b dark:border-gray-700 flex-shrink-0">
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 flex items-center">
                🧠 <span className="ml-2">
                  {viewMode === "hybrid" ? "Hybrid Thought Units" : "Thought Units"}
                </span>
              </h2>
            </div>
            
            <div className="flex-1 overflow-auto">
              {viewMode === "hybrid" && thoughtUnits.length > 0 ? (
                <div className="p-6 space-y-6">
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center">
                      <span className="text-lg mr-2">⚡</span>
                      Hybrid Reading Controls
                    </h3>
                    
                    <div className="flex gap-3 mb-4">
                      <button
                        onClick={handlePlayPause}
                        disabled={!enabled}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all text-sm ${
                          isPlaying 
                            ? 'bg-red-500 dark:bg-red-600 hover:bg-red-600 dark:hover:bg-red-700 text-white' 
                            : 'bg-green-500 dark:bg-green-600 hover:bg-green-600 dark:hover:bg-green-700 text-white'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <span>{isPlaying ? '⏸️' : '▶️'}</span>
                        {isPlaying ? 'Pause' : 'Start'}
                      </button>
                      
                      <button
                        onClick={handleReset}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-all text-sm"
                      >
                        <span>🔄</span>
                        Reset
                      </button>
                      
                      <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-lg font-medium transition-all text-sm"
                      >
                        <span>⚙️</span>
                        Settings
                      </button>
                    </div>

                    {showSettings && (
                      <div className="bg-white dark:bg-gray-900 rounded-lg p-4 space-y-3 border dark:border-gray-700">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Reading Speed: {wpm} WPM
                          </label>
                          <input
                            type="range"
                            min="100"
                            max="600"
                            step="25"
                            value={wpm}
                            onChange={(e) => setWpm(Number(e.target.value))}
                            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Max Chunk Size: {maxChunkSize} words
                            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                              (Optimal: 4-5 words)
                            </span>
                          </label>
                          <input
                            type="range"
                            min="3"
                            max="8"
                            value={maxChunkSize}
                            onChange={(e) => setMaxChunkSize(Number(e.target.value))}
                            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                            <span>Short</span>
                            <span className="text-green-600 dark:text-green-400">Optimal</span>
                            <span>Long</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="bg-blue-50 dark:bg-blue-900 rounded-lg p-2">
                        <div className="text-lg font-bold text-blue-600 dark:text-blue-300">{percentComplete}%</div>
                        <div className="text-xs text-blue-600 dark:text-blue-300">Complete</div>
                      </div>
                      <div className="bg-green-50 dark:bg-green-900 rounded-lg p-2">
                        <div className="text-lg font-bold text-green-600 dark:text-green-300">{currentChunkIndex + 1}</div>
                        <div className="text-xs text-green-600 dark:text-green-300">Current</div>
                      </div>
                      <div className="bg-purple-50 dark:bg-purple-900 rounded-lg p-2">
                        <div className="text-lg font-bold text-purple-600 dark:text-purple-300">{wpm}</div>
                        <div className="text-xs text-purple-600 dark:text-purple-300">WPM</div>
                      </div>
                      <div className="bg-orange-50 dark:bg-orange-900 rounded-lg p-2">
                        <div className="text-lg font-bold text-orange-600 dark:text-orange-300">{estimatedTime}s</div>
                        <div className="text-xs text-orange-600 dark:text-orange-300">Left</div>
                      </div>
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-2 font-medium">
                      {currentChapterInfo ? (
                        <span>
                          <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                            {currentChapterInfo.chapter.title}
                          </span>
                          {" • "}
                          Unit {currentChapterInfo.unitInChapter} of {currentChapterInfo.chapter.units.length}
                        </span>
                      ) : (
                        `Thought Unit ${currentChunkIndex + 1} of ${thoughtUnits.length}`
                      )}
                    </div>
                    
                    <div className="text-2xl leading-relaxed font-medium text-gray-800 dark:text-gray-200 min-h-[100px] flex items-center justify-center flex-wrap gap-2">
                      {currentWords.map((word, index) => (
                        <span
                          key={index}
                          className={`px-2 py-1 rounded-lg transition-all duration-300 ${
                            index === currentWordIndex
                              ? 'bg-yellow-400 dark:bg-yellow-600 text-gray-900 dark:text-gray-100 transform scale-110 shadow-lg font-semibold'
                              : index < currentWordIndex
                              ? 'text-gray-400 dark:text-gray-600 opacity-60'
                              : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {word}
                        </span>
                      ))}
                    </div>
                    
                    <div className="mt-4 max-w-sm mx-auto">
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-yellow-400 dark:bg-yellow-600 h-2 rounded-full transition-all duration-300"
                          style={{
                            width: `${((currentWordIndex + 1) / currentWords.length) * 100}%`
                          }}
                        />
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Word {currentWordIndex + 1} of {currentWords.length}
                      </div>
                    </div>
                  </div>

                  <div className="max-h-64 overflow-y-auto space-y-2">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center">
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
                <div className="h-full flex flex-col justify-center items-center text-gray-500 dark:text-gray-400 p-8">
                  <div className="text-6xl mb-6">🧠</div>
                  <p className="text-xl font-semibold text-center mb-2">Thought units will appear here</p>
                  <p className="text-sm text-center text-gray-400 dark:text-gray-500 max-w-md mb-6">
                    Upload a book and click "Create Thought Units" to transform the text into optimized reading chunks.
                  </p>
                  
                  <div className="text-xs text-gray-400 dark:text-gray-500 space-y-2 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg max-w-md">
                    <div className="font-semibold text-gray-600 dark:text-gray-400 mb-2">Benefits of Thought Unit Reading:</div>
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