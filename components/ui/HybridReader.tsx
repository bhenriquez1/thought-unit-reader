import { useEffect, useState } from "react";
import { parseBookWithChapters } from "../lib/parser";

type Chapter = {
  title: string;
  page: number;
};

interface HybridReaderProps {
  file: File;
  chapters: Chapter[];
  currentPage: number;
  onJumpToPage?: (page: number) => void;
}

export default function HybridReader({
  file,
  chapters,
  currentPage,
  onJumpToPage,
}: HybridReaderProps) {
  const [phrases, setPhrases] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const process = async () => {
      setLoading(true);
      try {
        const parsed = await parseBookWithChapters(file);
        const combined = parsed.map((c) => c.title + " ").join(" ");
        const split = combined
          .split(/(?<=[.?!])\s+(?=[A-Z])/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        setPhrases(split);
      } catch (e) {
        console.error("Failed to parse file", e);
        setPhrases(["Error parsing document."]);
      } finally {
        setLoading(false);
      }
    };

    process();
  }, [file]);

  if (loading) return <div>Loading hybrid view...</div>;

  return (
    <div className="space-y-2 max-w-4xl mx-auto">
      {phrases.map((phrase, i) => (
        <div
          key={i}
          className={`py-2 px-3 rounded-md my-1 ${
            i % 2 === 0 ? "bg-gray-100 dark:bg-zinc-800" : "bg-white dark:bg-zinc-700"
          }`}
        >
          <p className="leading-relaxed">{phrase}</p>
          {onJumpToPage && (
            <button
              className="mt-2 text-xs text-blue-600 hover:underline"
              onClick={() => onJumpToPage(currentPage)}
            >
              ↩ Jump to Page {currentPage}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}