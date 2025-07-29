import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface HybridReaderProps {
  content?: string;
  html?: string;
}

export default function HybridReader({ content = "", html = "" }: HybridReaderProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const current = ref.current;
    if (!current) return;

    const links = current.querySelectorAll("a[href^='#chapter-']");
    const handleClick = (e: Event) => {
      e.preventDefault();
      const id = (e.target as HTMLAnchorElement).getAttribute("href")?.slice(1);
      const target = document.getElementById(id!);
      if (target) target.scrollIntoView({ behavior: "smooth" });
    };

    links.forEach((link) => link.addEventListener("click", handleClick));
    return () => links.forEach((link) => link.removeEventListener("click", handleClick));
  }, [html]);

  const units = content.split(".").filter(Boolean);
  const totalUnits = units.length;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [wpm, setWpm] = useState(200);
  const [isPlaying, setIsPlaying] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const words = units[currentIndex]?.trim().split(" ") || [];
  const totalWords = words.length;
  const [wordIndex, setWordIndex] = useState(0);

  const timePerWord = 60000 / wpm;
  const timeLeft = Math.ceil(((totalUnits - currentIndex) * totalWords - wordIndex) * timePerWord / 1000);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handlePrev();
      else if (e.key === "ArrowRight") handleNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [wordIndex, currentIndex]);

  useEffect(() => {
    if (isPlaying && wordIndex < totalWords) {
      timerRef.current = setTimeout(() => {
        setWordIndex((prev) => prev + 1);
      }, timePerWord);
    } else if (isPlaying && wordIndex >= totalWords) {
      if (currentIndex < totalUnits - 1) {
        setCurrentIndex((prev) => prev + 1);
        setWordIndex(0);
      } else {
        setIsPlaying(false);
      }
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, wordIndex, currentIndex]);

  useEffect(() => {
    const currentEl = document.getElementById(`unit-${currentIndex}`);
    if (currentEl) {
      currentEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentIndex]);

  const handleStart = () => setIsPlaying(true);
  const handleReset = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsPlaying(false);
    setCurrentIndex(0);
    setWordIndex(0);
  };

  const handleWpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    if (!isNaN(val) && val > 0) {
      setWpm(val);
    }
  };

  const handlePrev = () => {
    if (wordIndex > 0) {
      setWordIndex((prev) => prev - 1);
    } else if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setWordIndex(units[currentIndex - 1]?.trim().split(" ").length - 1 || 0);
    }
  };

  const handleNext = () => {
    if (wordIndex < totalWords - 1) {
      setWordIndex((prev) => prev + 1);
    } else if (currentIndex < totalUnits - 1) {
      setCurrentIndex((prev) => prev + 1);
      setWordIndex(0);
    }
  };

  const progress = Math.floor(((currentIndex + wordIndex / totalWords) / totalUnits) * 100);

  return (
    <div className="w-full p-4 space-y-6">
      <h1 className="text-pink-500 font-bold text-xl">Thought-Unit Reader</h1>
      <p className="text-sm text-gray-400 mb-2">Read deeper, faster, and smarter.</p>

      <Card className="p-4 shadow-lg">
        <div className="flex flex-wrap items-center gap-4">
          <Button onClick={handleStart} className="bg-green-500 hover:bg-green-600 text-white">▶ Start</Button>
          <Button onClick={handleReset} className="bg-gray-300 text-black">🔁 Reset</Button>
          <Button onClick={handlePrev} className="bg-blue-300">⬅</Button>
          <Button onClick={handleNext} className="bg-blue-300">➡</Button>
          <div className="flex flex-col">
            <Label htmlFor="wpm" className="text-xs">WPM</Label>
            <Input
              id="wpm"
              type="number"
              value={wpm}
              onChange={handleWpmChange}
              className="w-20 text-black"
            />
          </div>
          <div className="text-center">
            <p className="text-xs">Complete</p>
            <p className="text-blue-500 font-bold">{progress}%</p>
          </div>
          <div className="text-center">
            <p className="text-xs">Current</p>
            <p className="text-green-500 font-bold">{currentIndex + 1}</p>
          </div>
          <div className="text-center">
            <p className="text-xs">WPM</p>
            <p className="text-purple-500 font-bold">{wpm}</p>
          </div>
          <div className="text-center">
            <p className="text-xs">Left</p>
            <p className="text-orange-500 font-bold">{timeLeft}s</p>
          </div>
        </div>
      </Card>

      <div className="text-center mt-6" id={`unit-${currentIndex}`}>
        <h2 className="text-sm text-gray-500">Thought Unit {currentIndex + 1} of {totalUnits}</h2>
        <div className="flex justify-center flex-wrap gap-2 text-2xl mt-4">
          {words.map((word, idx) => (
            <span
              key={idx}
              className={`transition-all px-2 py-1 rounded ${
                idx === wordIndex ? "bg-yellow-400 font-bold" : "text-gray-800"
              }`}
            >
              {word}
            </span>
          ))}
        </div>
        <div className="mt-4">
          <div className="w-full h-2 bg-gray-200 rounded">
            <div
              className="h-2 bg-yellow-400 rounded"
              style={{ width: `${(wordIndex / totalWords) * 100}%` }}
            ></div>
          </div>
          <p className="text-xs mt-1">Word {wordIndex + 1} of {totalWords}</p>
        </div>
      </div>

      {html && (
        <ScrollArea className="h-full w-full p-4">
          <div
            ref={ref}
            className="prose dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </ScrollArea>
      )}
    </div>
  );
}