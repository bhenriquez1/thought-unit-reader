// Fix TypeError and implement requested features

import { useState, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function Reader() {
  const [pdfFile, setPdfFile] = useState(null);
  const [textContent, setTextContent] = useState('');
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  const [bookStructure, setBookStructure] = useState(null);

  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const arrayBuffer = await file.arrayBuffer();
    const byteArray = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder();
    const decodedText = decoder.decode(byteArray);

    try {
      const parsed = await parseBookWithChapters(decodedText);
      setBookStructure(parsed);
      setTextContent(JSON.stringify(parsed, null, 2));
    } catch (err) {
      console.error('Parser error:', err);
      setTextContent('Error parsing file.');
    }
    setPdfFile(file);
  };

  const handleZoomIn = () => setZoom((z) => z + 0.2);
  const handleZoomOut = () => setZoom((z) => Math.max(0.2, z - 0.2));

  const handleTocSelect = (e) => {
    const page = parseInt(e.target.value);
    setPageNumber(page);
  };

  return (
    <div className="flex flex-col gap-4 p-4 dark:bg-black min-h-screen">
      <div className="flex justify-between">
        <h1 className="text-xl font-bold">🧠 Thought Unit Reader</h1>
        <input
          type="file"
          accept=".pdf,.txt,.docx"
          onChange={handleFileUpload}
          className="text-sm"
          ref={fileInputRef}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* PDF Preview */}
        <div className="border p-2 dark:bg-zinc-900">
          {pdfFile && (
            <Document file={pdfFile} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
              <Page pageNumber={pageNumber} scale={zoom} />
            </Document>
          )}
        </div>

        {/* Thought Unit Output */}
        <div className="border p-2 dark:bg-zinc-900 overflow-y-auto whitespace-pre-wrap">
          {textContent || 'Upload a file to get output.'}
        </div>

        {/* Table of Contents */}
        <div className="border p-2 dark:bg-zinc-900">
          <Label htmlFor="toc">Table of Contents</Label>
          <select id="toc" className="w-full mt-2" onChange={handleTocSelect}>
            {bookStructure?.chapters?.map((ch, idx) => (
              <option key={idx} value={ch.page || idx + 1}>
                {ch.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2 justify-center mt-4">
        <Button onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}>Prev</Button>
        <Button onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))}>Next</Button>
        <Button onClick={handleZoomIn}>Zoom In</Button>
        <Button onClick={handleZoomOut}>Zoom Out</Button>
      </div>

      <div className="text-center mt-2 text-sm">
        Page {pageNumber} of {numPages}
      </div>
    </div>
  );
}

// NOTE: Ensure parseBookWithChapters returns a BookStructure object with chapters and page numbers for proper integration.
// Also ensure styles and Tailwind classes are applied as needed to match dark/light mode styles.
// Add error boundaries where needed for better robustness.