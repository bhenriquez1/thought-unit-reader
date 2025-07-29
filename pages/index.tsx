import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { parseBookWithChapters, generateProgressiveReadingHTML } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { ChevronLeft, ChevronRight, Settings } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function Home() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(null);
  const [viewMode, setViewMode] = useState("hybrid");
  const [wpm, setWpm] = useState(110);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [thoughtUnits, setThoughtUnits] = useState<string[][]>([]);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      const reader = new FileReader();
      reader.onload = async () => {
        const text = reader.result as string;
        setInputText(text);
        const result = await parseBookWithChapters(text);
        setThoughtUnits(result.parsedUnits || []); // ✅ Corrected line
      };
      reader.readAsText(uploadedFile);
    }
  }, []);

  const handleStart = () => {
    if (!thoughtUnits.length) return;
    setIsPlaying(true);
    intervalRef.current = setInterval(() => {
      setCurrentWordIndex((prev) => {
        const nextIndex = prev + 1;
        if (nextIndex >= thoughtUnits.length) {
          clearInterval(intervalRef.current!);
          return prev;
        }
        return nextIndex;
      });
    }, 60000 / wpm);
  };

  const handleReset = () => {
    setIsPlaying(false);
    clearInterval(intervalRef.current!);
    setCurrentWordIndex(0);
  };

  const togglePlay = () => (isPlaying ? handleReset() : handleStart());

  return (
    <div className="flex min-h-screen bg-black text-white">
      <aside className="w-64 p-4 border-r border-gray-700">
        <h1 className="text-2xl font-bold text-pink-500">Thought-Unit Reader</h1>
        <p className="text-sm text-gray-300 mb-4">Read deeper, faster, and smarter.</p>
        <input type="file" onChange={handleFileUpload} className="mb-4" />
        <Label htmlFor="mode">Reading Mode</Label>
        <select
          id="mode"
          className="w-full mb-4 p-2 rounded bg-gray-900 text-white"
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value)}
        >
          <option value="hybrid">Hybrid</option>
          <option value="chapters">Chapters</option>
          <option value="progressive">Progressive</option>
        </select>
        <div>
          <Button onClick={() => setEnabled((prev) => !prev)}>
            Toggle Light Mode
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-8">
        <div className="flex items-center space-x-4 mb-4">
          <Button onClick={handleStart} disabled={isPlaying}>
            ▶ Start
          </Button>
          <Button onClick={handleReset}>⟳ Reset</Button>
          <Button variant="outline">
            <Settings className="w-4 h-4" />
          </Button>
          <span className="text-sm text-yellow-400">
            {thoughtUnits.length ? `${Math.floor((currentWordIndex / thoughtUnits.length) * 100)}% Complete` : '0% Complete'}
          </span>
          <span className="text-sm">{currentWordIndex + 1} Current</span>
          <span className="text-purple-400">{wpm} WPM</span>
        </div>

        <div className="text-center mt-8">
          <h2 className="text-lg font-semibold text-gray-400 mb-2">
            Thought Unit {currentWordIndex + 1} of {thoughtUnits.length || 0}
          </h2>
          <div className="text-2xl font-bold text-yellow-300 bg-gray-900 px-6 py-4 rounded">
            {thoughtUnits[currentWordIndex]?.map((word, idx) => (
              <span
                key={idx}
                className={cn("mx-1", {
                  'text-yellow-400': idx === 0,
                  'text-white': idx !== 0
                })}
              >
                {word}
              </span>
            ))}
          </div>
          <p className="mt-2 text-sm text-gray-400">
            Word {thoughtUnits[currentWordIndex]?.length ? `1 of ${thoughtUnits[currentWordIndex].length}` : '1 of 0'}
          </p>
        </div>
        <div className="flex justify-center mt-6 space-x-4">
          <Button onClick={() => setCurrentWordIndex((i) => Math.max(i - 1, 0))}>
            <ChevronLeft />
          </Button>
          <Button onClick={() => setCurrentWordIndex((i) => Math.min(i + 1, thoughtUnits.length - 1))}>
            <ChevronRight />
          </Button>
        </div>
      </main>
    </div>
  );
}