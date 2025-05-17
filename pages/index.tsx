import { useState, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";

// ✅ Corrected relative imports:
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  return (
    <div className="min-h-screen p-6 bg-gray-100">
      <h1 className="text-3xl font-bold mb-4">Thought-Unit Reader</h1>

      <div className="mb-4">
        <Label htmlFor="fileUpload">Upload PDF</Label>
        <Input
          id="fileUpload"
          type="file"
          accept=".pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </div>

      {file && (
        <div className="border rounded p-4 bg-white shadow">
          <Document
            file={file}
            onLoadSuccess={onDocumentLoadSuccess}
            className="mb-4"
          >
            {Array.from(new Array(numPages), (el, index) => (
              <Page
                key={`page_${index + 1}`}
                pageNumber={index + 1}
                width={600}
              />
            ))}
          </Document>
        </div>
      )}

      <div className="mt-6 flex items-center gap-4">
        <Label htmlFor="toggleParser">Enable Parser</Label>
        <Switch id="toggleParser" />
        <Button>Start Parsing</Button>
      </div>
    </div>
  );
}