// pages/index.tsx
import { useEffect, useState, useRef } from "react";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import mammoth from "mammoth";
import { improveBiomedicalParsing } from "../lib/parser";
import Tesseract from "tesseract.js";
import ePub from "epubjs";

// PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function Home() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState<Blob | null>(null);
  const [fileText, setFileText] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [manualEdit, setManualEdit] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle"|"uploading"|"done">("idle");
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Drag-and-drop handlers
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) {
      processFile(e.dataTransfer.files[0]);
    }
  };
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  async function processFile(file: File) {
    setFileName(file.name);
    setPdfError(null);
    setUploadStatus("uploading");
    const preview = URL.createObjectURL(file);
    setThumb(preview);
    await new Promise(r => setTimeout(r, 300));
    setUploadStatus("done");

    if (file.type === "application/pdf") {
      const buf = await file.arrayBuffer();
      setFileUrl(new Blob([buf], { type: file.type }));
      const txt = await extractPDF(buf);
      setFileText(txt);

    } else if (file.name.endsWith(".epub")) {
      const book = ePub(URL.createObjectURL(file));
      await book.ready;
      const spine = book.spine.get(0)!;
      const xhtml = await spine.text();
      const doc = new DOMParser().parseFromString(xhtml, "text/html");
      setFileText(doc.body.textContent || "");

    } else if (file.type.startsWith("image/")) {
      const { data: { text } } = await Tesseract.recognize(file, 'eng');
      setFileText(text);

    } else {
      const reader = new FileReader();
      reader.onload = async e => {
        const res = e.target?.result;
        if (file.name.endsWith('.docx') && res instanceof ArrayBuffer) {
          const { value } = await mammoth.extractRawText({ arrayBuffer: res });
          setFileText(value);
        } else if (typeof res === 'string') {
          setFileText(res);
        }
      };
      if (file.name.endsWith('.docx')) reader.readAsArrayBuffer(file);
      else reader.readAsText(file);
    }
  }

  async function extractPDF(buffer: ArrayBuffer): Promise<string> {
    try {
      const pdf = await pdfjs.getDocument({ data: buffer }).promise;
      let txt = "";
      for (let i=1; i<=pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        txt += content.items.map((it:any)=>it.str).join(' ') + '\n';
      }
      return txt;
    } catch (e) {
      console.error(e);
      return '';
    }
  }

  const runParser = () => {
    if (!enabled || !fileText) return;
    setLoading(true);
    setTimeout(() => {
      const parsed = improveBiomedicalParsing(fileText);
      setOutput(parsed);
      setLoading(false);
      document.getElementById('thought-output')?.scrollIntoView({ behavior: 'smooth' });
    }, 500);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-6xl p-6">
        <h1 className="text-3xl font-bold text-center mb-6">Thought-Unit Reader</h1>

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed border-gray-300 rounded-xl p-4 mb-6"
        >
          <p className="text-center text-gray-500">Drag & drop a file here, or</p>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,.txt,.epub,.png,.jpg,.jpeg"
            className="hidden"
            onChange={e=>e.target.files && processFile(e.target.files[0])}
          />
          <Button onClick={()=>inputRef.current?.click()} className="mt-2 mx-auto block">
            Choose File
          </Button>
        </div>

        {thumb && <img src={thumb} alt="thumb" className="h-24 object-contain mb-4 mx-auto" />}
        {uploadStatus==='uploading' && <div className="text-yellow-800 bg-yellow-100 p-2 rounded-xl mb-4">Uploading...</div>}
        {uploadStatus==='done'    && <div className="text-green-800 bg-green-100 p-2 rounded-xl mb-4">Upload complete!</div>}

        <div className="flex items-center justify-between mb-4">
          <Label htmlFor="toggleParser" className="text-gray-700">Enable Parser</Label>
          <Switch id="toggleParser" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <Button
          onClick={runParser}
          disabled={loading || !enabled}
          className="w-full mb-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
        >
          {loading ? 'Parsing...' : 'Start Parsing'}
        </Button>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 p-4 rounded-xl overflow-auto max-h-[80vh]">
            <h2 className="font-semibold text-xl mb-2">📘 Original View</h2>
            {fileUrl
              ? <Document
                  file={fileUrl}
                  onLoadError={e=>setPdfError(e.message)}
                  onLoadSuccess={({ numPages })=>setNumPages(numPages)}
                >
                  {Array.from({length: numPages}).map((_,i)=><Page key={i} pageNumber={i+1}/>)}}
                </Document>
              : <p className="italic text-gray-500">No file loaded.</p>
            }
            {pdfError && <p className="text-red-500 mt-2">❌ {pdfError}</p>}
          </div>
          <div id="thought-output" className="bg-white p-4 rounded-xl overflow-auto max-h-[80vh]">
            <div className="flex justify-between mb-2">
              <h2 className="font-semibold text-xl">🧠 Output</h2>
              <Button onClick={()=>setManualEdit(!manualEdit)}>
                {manualEdit ? 'Disable Edit' : 'Edit'}
              </Button>
            </div>
            <div
              className="whitespace-pre-wrap text-sm"
              contentEditable={manualEdit}
              suppressContentEditableWarning
              dangerouslySetInnerHTML={{ __html: output||'No output yet.' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}