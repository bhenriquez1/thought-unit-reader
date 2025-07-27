// pages/index.tsx
import { useState, useCallback, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { parseBookWithChapters, generateProgressiveReadingHTML } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function Home() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const pdf = await pdfjs.getDocument(await file.arrayBuffer()).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item: any) => item.str);
      fullText += strings.join(" ") + "\n";
    }
    return fullText;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFile(file);
    setLoading(true);
    const text = await extractTextFromPDF(file);
    setInputText(text);
    const parsed = await parseBookWithChapters(text);
    setOutput(parsed);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <header className="p-6 text-center bg-white shadow-sm border-b">
        <div className="flex flex-col items-center justify-center space-y-1">
          <h1 className="text-3xl font-extrabold text-gray-800 flex items-center gap-2">
            <span>🧠</span> Thought Unit Reader
          </h1>
          <p className="text-md text-gray-500">
            Transform any book into thought-units for enhanced comprehension
          </p>
        </div>
      </header>

      {/* FILE INPUT */}
      <div className="p-6 flex flex-col items-center space-y-4">
        <input
          type="file"
          accept="application/pdf"
          onChange={handleFileUpload}
          className="p-2 border rounded"
        />
        {loading && (
          <div className="text-center py-6 text-lg font-semibold text-gray-600 animate-pulse">
            🧠 Parsing… Please wait ⚡
          </div>
        )}
      </div>

      {/* OUTPUT */}
      <div className="px-6">
        {output && (
          <div
            className="whitespace-pre-wrap bg-white p-4 rounded shadow-sm text-gray-800"
            dangerouslySetInnerHTML={{ __html: output }}
          />
        )}
      </div>
    </div>
  );
}