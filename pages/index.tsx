// pages/index.tsx
import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { parseBookWithChapters, generateProgressiveReadingHTML } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "none";
type ViewMode = "original" | "chapters" | "progressive" | "hybrid";

export default function Home() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [file, setFile] = useState<File | null>(null);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);

    const reader = new FileReader();
    reader.onload = async () => {
      const byteArray = new Uint8Array(reader.result as ArrayBuffer);
      const textContent = new TextDecoder().decode(byteArray);
      const parsed = await parseBookWithChapters(textContent);
      setOutput(parsed as string);
    };
    reader.readAsArrayBuffer(f);
  };

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="text-center text-2xl font-bold mb-2">
        🧠 Thought Unit Reader
      </div>
      <p className="text-center text-gray-400 mb-4">
        Transform any book into thought-units for enhanced comprehension
      </p>

      <div className="text-center mb-4">
        <input type="file" onChange={onFileChange} className="mb-2" />
        <div className="text-gray-400 text-sm">or drag and drop your file above</div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="border border-gray-600 rounded p-2">
          📄 PDF Preview
          {file && (
            <Document
              file={file}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
              <Page pageNumber={pageNumber} />
            </Document>
          )}
        </div>

        <div className="border border-gray-600 rounded p-2">
          🧠 Thought Unit Output
          <div className="whitespace-pre-wrap mt-2">
            {output || "null"}
          </div>
        </div>

        <div className="border border-gray-600 rounded p-2">
          📂 Table of Contents
          <select className="w-full mt-2 bg-black border border-gray-400 p-1 rounded text-white">
            <option>-- Chapter Jump --</option>
          </select>
        </div>
      </div>

      <div className="flex justify-center mt-4 gap-2">
        <span>Page {pageNumber} of {numPages}</span>
        <Button onClick={() => setPageNumber((p) => Math.max(p - 1, 1))}>Prev</Button>
        <Button onClick={() => setPageNumber((p) => Math.min(p + 1, numPages))}>Next</Button>
        <Button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Zoom In</Button>
        <Button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Zoom Out</Button>
      </div>
    </div>
  );
}