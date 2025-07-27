import { useState, useCallback, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { parseBookWithChapters } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function Home() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [output, setOutput] = useState<any>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async () => {
        const text = reader.result as string;
        setInputText(text);
        setLoading(true);
        const parsed = await parseBookWithChapters(text);
        setOutput(parsed);
        setLoading(false);
      };
      reader.readAsText(file);
    }
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));

  const goToPage = (page: number) => setPageNumber(page);

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold mb-2">🧠 Thought Unit Reader</h1>
      <p className="mb-4 text-gray-600">
        Transform any book into thought-units for enhanced comprehension
      </p>

      <div className="flex items-center gap-4 mb-4">
        <input type="file" ref={fileInputRef} onChange={handleFileChange} />
        <Button onClick={handleZoomIn}>Zoom In</Button>
        <Button onClick={handleZoomOut}>Zoom Out</Button>
        <Button onClick={() => goToPage(pageNumber + 1)}>Next Page</Button>
        <Button onClick={() => goToPage(pageNumber - 1)}>Prev Page</Button>
      </div>

      {loading && (
        <div className="text-lg font-medium animate-pulse">
          Parsing… Please wait 🧠⚡
        </div>
      )}

      {output && (
        <div className="mt-4">
          <div className="mb-4">
            <Label>Jump to Chapter:</Label>
            <select
              className="border p-2 rounded"
              onChange={(e) => {
                const chapter = output.chapters.find(
                  (c: any) => c.title === e.target.value
                );
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

          <div
            style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
          >
            <Document
              file={inputText}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            >
              <Page pageNumber={pageNumber} />
            </Document>
          </div>
        </div>
      )}
    </div>
  );
}