// components/HybridReader.tsx
import { useEffect, useState } from "react";
import { parseBookWithChapters, generateProgressiveReadingHTML } from "@/lib/parser";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function HybridReader() {
  const [rawText, setRawText] = useState<string>("");
  const [phrases, setPhrases] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [enabled, setEnabled] = useState<boolean>(false);
  const [wpm, setWpm] = useState<number>(200);
  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Load default demo content for now
    const sample = `In biochemistry, proteins are essential macromolecules. They perform a vast array of functions. This includes catalyzing metabolic reactions. Providing structure to cells. And responding to stimuli.`;
    const output = generateProgressiveReadingHTML(sample);
    setRawText(output.text);
    setPhrases(output.phrases);
  }, []);

  useEffect(() => {
    if (!enabled || phrases.length === 0) return;
    const interval = 60000 / wpm;
    const id = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1 < phrases.length ? prev + 1 : prev));
    }, interval);
    setTimer(id);
    return () => clearInterval(id);
  }, [enabled, wpm, phrases]);

  const handleReset = () => {
    setCurrentIndex(0);
    setEnabled(false);
    if (timer) clearInterval(timer);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label>Enable Reader</Label>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="wpm">WPM</Label>
          <input
            id="wpm"
            type="number"
            className="w-20 px-2 py-1 border rounded text-black"
            value={wpm}
            onChange={(e) => setWpm(parseInt(e.target.value))}
          />
        </div>
        <Button variant="destructive" onClick={handleReset}>
          Reset
        </Button>
      </div>

      <div className="p-6 border rounded bg-gray-100 dark:bg-gray-800 text-xl min-h-[120px]">
        {phrases[currentIndex]}
      </div>
    </div>
  );
}