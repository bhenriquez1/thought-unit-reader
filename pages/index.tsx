import { useState, useCallback, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { parseBookWithChapters } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import Tesseract from "tesseract.js";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function Home() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState<string>("");
  const [output, setOutput] = useState<any>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [darkMode, setDarkMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [ocrFallbackText, setOcrFallbackText] = useState<string>("");

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const text = reader.result as string;
          setInputText(text);
          const parsed = await parseBookWithChapters(text);
          setOutput(parsed);
        } catch (error) {
          const image = await pdfToImage(file);
          const result = await Tesseract.recognize(image, "eng");
          setOcrFallbackText(result.data.text);
        } finally {
          setLoading(false);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      console.error("File parsing failed", err);
      setLoading(false);
    }
  };

  const pdfToImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const goToPage = (page: number) => setPageNumber(Math.max(1, Math.min(page, numPages || 1)));

  return (
    <div className={`p-4 ${darkMode ? "bg-black text-white" : "bg-white text-black"}`}>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-3xl font-bold">🧠 Thought Unit Reader</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Transform any book into thought-units for enhanced comprehension
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="darkmode">Dark Mode</Label>
          <Switch id="darkmode" checked={darkMode} onCheckedChange={() => setDarkMode(!darkMode)} />
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-4">
        <input type="file" ref={fileInputRef} onChange={handleFileChange} />
        <Button onClick={handleZoomIn}>Zoom In</Button>
        <Button onClick={handleZoomOut}>Zoom Out</Button>
        <Button onClick={() => goToPage(pageNumber - 1)}>Prev</Button>
        <Button onClick={() => goToPage(pageNumber + 1)}>Next</Button>
        <input
          type="number"
          placeholder="Go to page"
          className="border rounded px-2 py-1 w-24"
          onChange={(e) => goToPage(Number(e.target.value))}
        />
      </div>

      {loading && <div className="text-lg font-medium animate-pulse">Parsing… Please wait 🧠⚡</div>}

      {!loading && ocrFallbackText && (
        <div className="mt-4">
          <h2 className="text-xl font-semibold mb-2">OCR Fallback Result</h2>
          <pre className="whitespace-pre-wrap bg-gray-100 dark:bg-gray-800 p-4 rounded">
            {ocrFallbackText}
          </pre>
        </div>
      )}

      {output && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="border p-4 rounded bg-gray-50 dark:bg-gray-900">
            <Label>PDF Preview</Label>
            <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
              <Document file={inputText} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
                <Page pageNumber={pageNumber} />
              </Document>
            </div>
          </div>

          <div className="border p-4 rounded bg-gray-50 dark:bg-gray-900">
            <Label>Thought Unit Output</Label>

            <div className="mb-4">
              <Label>Table of Contents</Label>
              <select
                className="border p-2 rounded w-full"
                onChange={(e) => {
                  const chapter = output.chapters.find((c: any) => c.title === e.target.value);
                  if (chapter?.pageNumber) goToPage(chapter.pageNumber);
                }}
              >
                {output.chapters.map((ch: any, idx: number) => (
                  <option key={idx} value={ch.title}>
                    {ch.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap">
              {output.text}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}