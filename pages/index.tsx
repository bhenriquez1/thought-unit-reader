// pages/index.tsx
import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { parseBookWithChapters, generateProgressiveReadingHTML } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

import { useDropzone } from "react-dropzone";

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "none";
type ViewMode = "original" | "chapters" | "progressive" | "hybrid";

export default function Home() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [toc, setToc] = useState<string[]>([]);
  const [selectedPage, setSelectedPage] = useState<number>(1);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const reader = new FileReader();

      reader.onload = async (e) => {
        const byteArray = new Uint8Array(e.target?.result as ArrayBuffer);
        const textContent = new TextDecoder().decode(byteArray);
        const result = await parseBookWithChapters(textContent as unknown as string);
        setOutput(result?.content || "");
        setToc(result?.toc || []);
      };

      reader.readAsArrayBuffer(file);
    }
  }, []);

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  const handleTOCJump = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const page = parseInt(e.target.value, 10);
    if (!isNaN(page)) setSelectedPage(page);
  };

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <h1 className="text-3xl font-bold">🧠 Thought Unit Reader</h1>
      <p className="mb-4">Transform any book into thought-units for enhanced comprehension</p>

      <div {...getRootProps()} className="border border-dashed border-white p-4 mb-4 cursor-pointer text-center">
        <input {...getInputProps()} />
        <p>📄 Drag and drop your file here or click to upload</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="border p-2">
          <h2 className="text-lg font-semibold">📄 PDF Preview</h2>
          {/* Future PDF rendering here */}
        </div>

        <div className="border p-2">
          <h2 className="text-lg font-semibold">🧠 Thought Unit Output</h2>
          <div className="whitespace-pre-wrap max-h-[500px] overflow-y-auto">
            {output || "Upload a file to begin"}
          </div>
        </div>

        <div className="border p-2">
          <h2 className="text-lg font-semibold">📁 Table of Contents</h2>
          <select onChange={handleTOCJump} className="w-full bg-black text-white border border-white p-1">
            <option value="">Select Chapter</option>
            {toc.map((title, index) => (
              <option key={index} value={index + 1}>
                {title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button onClick={() => setSelectedPage((p) => Math.max(1, p - 1))}>Prev</Button>
        <Button onClick={() => setSelectedPage((p) => p + 1)}>Next</Button>
        <Button>Zoom In</Button>
        <Button>Zoom Out</Button>
      </div>
    </div>
  );
}