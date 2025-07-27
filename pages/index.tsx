// pages/index.tsx - Phase 1 Stable Version with Dark Mode, ToC Fix, and PDF Zoom
import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { parseBookWithChapters } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "none";
type ViewMode = "original" | "chapters" | "progressive" | "hybrid";

export default function Home() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState<Uint8Array | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [toc, setToc] = useState<string[]>([]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = async () => {
      try {
        const arrayBuffer = reader.result as ArrayBuffer;
        const byteArray = new Uint8Array(arrayBuffer);
        setInputText(byteArray);

        const textContent = new TextDecoder().decode(byteArray);
        const parsed = await parseBookWithChapters(textContent);
        setOutput(parsed);

        const tocList = textContent
          .split('\n')
          .filter(line =>
            line.trim().length > 5 &&
            !line.includes("endstream") &&
            !line.includes("endobj") &&
            /chapter|section|unit|lesson/i.test(line)
          );
        setToc(tocList);
      } catch (error) {
        console.error("Error parsing file:", error);
        setOutput("Error parsing file");
      }
      setLoading(false);
    };
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <header className="p-4 flex items-center justify-between border-b">
        <div>
          <h1 className="text-2xl font-bold">🧠 Thought Unit Reader</h1>
          <p className="text-sm">Transform any book into thought-units for enhanced comprehension</p>
        </div>
        <div className="flex items-center gap-2">
          <span>Dark Mode</span>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </header>

      <main className="flex-1 grid grid-cols-3 gap-4 p-4">
        {/* PDF Viewer */}
        <section className="border rounded-xl p-2">
          <div className="font-semibold mb-2">📄 PDF Preview</div>
          {inputText && (
            <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
              <Document file={{ data: inputText }} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
                <Page pageNumber={pageNumber} />
              </Document>
            </div>
          )}
        </section>

        {/* Thought Units */}
        <section className="border rounded-xl p-2">
          <div className="font-semibold mb-2">🧠 Thought Unit Output</div>
          <Label htmlFor="file">Choose File</Label>
          <input id="file" type="file" accept=".pdf,.txt,.docx" onChange={handleFileUpload} />
          <textarea className="mt-2 w-full h-full bg-background text-foreground border rounded-md p-2" value={output || ""} readOnly />
        </section>

        {/* Table of Contents */}
        <section className="border rounded-xl p-2">
          <div className="font-semibold mb-2">📑 Table of Contents</div>
          <select className="w-full border p-1 rounded bg-background text-foreground">
            {toc.map((item, index) => (
              <option key={index}>{item}</option>
            ))}
          </select>
        </section>
      </main>

      <footer className="flex justify-center items-center p-2 border-t text-sm">
        Page {pageNumber} of {numPages}
        <div className="ml-4 flex gap-2">
          <Button variant="outline" onClick={() => setPageNumber(p => Math.max(1, p - 1))}>Prev</Button>
          <Button variant="outline" onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}>Next</Button>
          <Button variant="outline" onClick={() => setZoom(z => z + 0.2)}>Zoom In</Button>
          <Button variant="outline" onClick={() => setZoom(z => Math.max(0.2, z - 0.2))}>Zoom Out</Button>
        </div>
      </footer>
    </div>
  );
}