"use client";

import { useEffect, useState } from "react";
import { generateProgressiveReadingHTML } from "@/lib/parser";

export default function HybridReader() {
  const [rawText, setRawText] = useState<string>("");
  const [phrases, setPhrases] = useState<string[]>([]);
  const [zoom, setZoom] = useState<number>(100);

  useEffect(() => {
    const sample = [
      "In biochemistry, proteins are essential macromolecules.",
      "They perform a vast array of functions.",
      "This includes catalyzing metabolic reactions.",
      "Providing structure to cells.",
      "And responding to stimuli."
    ];

    const output = generateProgressiveReadingHTML(sample);
    setRawText(output.text);
    setPhrases(output.phrases);
  }, []);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Hybrid Reader 📖</h2>
        <div className="flex items-center gap-2">
          <label className="text-sm">Zoom:</label>
          <input
            type="range"
            min="50"
            max="200"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          <span className="text-sm">{zoom}%</span>
        </div>
      </div>
      <div
        className="prose max-w-none transition-all"
        style={{ fontSize: `${zoom}%` }}
        dangerouslySetInnerHTML={{ __html: rawText }}
      />
    </div>
  );
}