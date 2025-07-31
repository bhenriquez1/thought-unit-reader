"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import Loader from "@/components/ui/loader";
import ParsedText from "@/components/ParsedText";
import { Chapter } from "@/types/chapter";
import { cn } from "@/lib/utils";
import {
  parseBookWithChapters,
  generateHybridHTML,
  parseTextToUnits,
} from "@/lib/parser";
import { generateProgressiveReadingJSX } from "@/lib/client-parser";

// Use dynamic import for PDFViewer with consistent naming
const PDFViewer = dynamic(() => import("@/components/PDFViewer"), {
  ssr: false,
  loading: () => <Loader label="Loading PDF..." />,
});

interface HybridReaderProps {
  inputText?: string; // Added to accept the prop from pages/index.tsx
}

export default function HybridReader({ inputText }: HybridReaderProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [extension, setExtension] = useState<string>("");
  const [pdfURL, setPdfURL] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"original" | "chapters" | "progressive" | "hybrid">("original");

  const [parsedUnits, setParsedUnits] = useState<string[][]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [originalText, setOriginalText] = useState<string | null>(null);
  const [hybridHTML, setHybridHTML] = useState<string | null>(null);
  const [activeChapter, setActiveChapter] = useState(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploaded = e.target.files?.[0];
    if (uploaded) {
      const ext = uploaded.name.split(".").pop()?.toLowerCase() || "";
      setFile(uploaded);
      setPdfURL(URL.createObjectURL(uploaded));
      setExtension(ext);
    }
  };

  const getChapterText = (index: number) => {
    const start = chapters[index]?.page - 1 || 0;
    const end = chapters[index + 1]?.page - 1 || parsedUnits.length;
    return parsedUnits.slice(start, end).flat().join(" ");
  };

  useEffect(() => {
    // Process the inputText prop if provided and no file is loaded
    if (inputText && !file && !loading) {
      setLoading(true);
      try {
        const units = parseTextToUnits(inputText);
        setParsedUnits([units]);
        setOriginalText(inputText);
        
        // Create a default chapter if none exists
        if (chapters.length === 0) {
          setChapters([{ title: "Content", page: 1 }]);
        }
        
        setHybridHTML(generateHybridHTML(chapters, [units]));
        setLoading(false);
      } catch (err) {
        console.error("Error parsing input text:", err);
        setLoading(false);
      }
    }
  }, [inputText, file, loading, chapters]);

  useEffect(() => {
    const loadContent = async () => {
      if (!file) return;
      setLoading(true);
      try {
        const { parsedUnits, chapters, original } = await parseBookWithChapters(file);
        setParsedUnits(parsedUnits);
        setChapters(chapters);
        setOriginalText(original);
        setHybridHTML(generateHybridHTML(chapters, parsedUnits));
      } catch (err) {
        console.error("Error parsing file:", err);
        setHybridHTML("<p class='text-red-500'>Failed to process file.</p>");
      } finally {
        setLoading(false);
      }
    };
    loadContent();
  }, [file]);

  useEffect(() => {
    const onScroll = () => {
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

  const renderProgressiveChapters = () => (
    <div className="flex flex-col md:flex-row gap-6 w-full">
      <aside className="sticky top-4 md:w-1/4 w-full space-y-3 p-4 border rounded-md shadow bg-white dark:bg-zinc-900">
        <h2 className="font-bold text-lg text-zinc-800 dark:text-white mb-2">Chapters</h2>
        <ul className="space-y-2">
          {chapters.map((ch, i) => (
            <li key={i}>
              <a
                href={`#chapter-${i}`}
                className={cn(
                  "block text-sm font-medium hover:text-pink-600",
                  activeChapter === i
                    ? "text-pink-600"
                    : "text-zinc-700 dark:text-zinc-300"
                )}
              >
                {ch.title}
              </a>
            </li>
          ))}
        </ul>
      </aside>

      <section className="md:w-3/4 w-full px-4 space-y-8">
        {chapters.map((ch, i) => (
          <div key={i} id={`chapter-${i}`}>
            <h3 className="text-xl font-semibold mb-3 text-zinc-900 dark:text-white">
              {ch.title}
            </h3>
            {generateProgressiveReadingJSX(getChapterText(i))}
          </div>
        ))}
      </section>
    </div>
  );

  const renderView = () => {
    if (loading) return <Loader label="Processing your file..." />;
    if (!file && !inputText) return <p className="text-gray-400">Upload a textbook to get started.</p>;

    switch (viewMode) {
      case "original":
        return (
          <ScrollArea className="h-[80vh] border rounded p-4" ref={scrollRef}>
            {extension === "pdf" && <PDFViewer fileUrl={pdfURL} initialScale={1.2} />}
            {(extension === "txt" || inputText) && (
              <pre className="whitespace-pre-wrap text-sm">{originalText}</pre>
            )}
            {extension === "docx" && (
              <div dangerouslySetInnerHTML={{ __html: originalText || "" }} />
            )}
          </ScrollArea>
        );
      case "chapters":
        return renderProgressiveChapters();
      case "progressive":
        return (
          <ScrollArea className="h-[80vh] p-4 border rounded">
            <ParsedText parsedUnits={parsedUnits} />
          </ScrollArea>
        );
      case "hybrid":
        return (
          <div className="grid md:grid-cols-2 gap-6">
            {pdfURL ? (
              <div className="border rounded overflow-hidden">
                <PDFViewer fileUrl={pdfURL} showControls={false} />
              </div>
            ) : (
              <div className="border rounded p-4 bg-white dark:bg-zinc-900">
                <pre className="whitespace-pre-wrap text-sm">{originalText}</pre>
              </div>
            )}
            <ScrollArea className="h-[80vh] border rounded p-4 bg-white dark:bg-zinc-900">
              <div
                ref={contentRef}
                className="prose prose-sm sm:prose-base max-w-none dark:prose-invert"
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
    <main className="p-6 max-w-6xl mx-auto">
      <header className="mb-6 text-center">
        <h1 className="text-4xl font-bold text-pink-500">Thought-Unit Reader</h1>
        <p className="text-sm text-gray-300">Read deeper, faster, and smarter.</p>
      </header>

      <Label className="block mb-2">Upload a file (PDF, DOCX, or TXT):</Label>
      <input
        type="file"
        accept=".pdf,.docx,.txt"
        ref={fileRef}
        className="mb-4"
        onChange={handleFileChange}
      />

      <div className="flex flex-wrap gap-4 mt-2 mb-6">
        <Button onClick={() => setViewMode("original")} variant="secondary">
          📄 Original View
        </Button>
        <Button onClick={() => setViewMode("chapters")} variant="outline">
          📚 Chapters
        </Button>
        <Button onClick={() => setViewMode("progressive")} variant="outline">
          🧠 Progressive
        </Button>
        <Button onClick={() => setViewMode("hybrid")} variant="default">
          🔁 Hybrid View
        </Button>
      </div>

      <section className="mt-4">{renderView()}</section>
    </main>
  );
}