// pages/index.tsx
import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import ePub from "epubjs";
import Tesseract from "tesseract.js";
import mammoth from "mammoth";
import { improveBiomedicalParsing } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";

// Point PDF.js at the unpkg CDN worker so we don't have to bundle it
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

export default function Home() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileUrl, setFileUrl] = useState<Blob | null>(null);
  const [fileText, setFileText] = useState<string>("");
  const [output, setOutput] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [manualEditMode, setManualEditMode] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle"|"uploading"|"done">("idle");
  const [pdfError, setPdfError] = useState<string|null>(null);
  const [thumbnail, setThumbnail] = useState<string|null>(null);

  const user = true;  // stubbed

  async function extractTextFromPDF(buffer: ArrayBuffer): Promise<string> {
    try {
      const pdf = await pdfjs.getDocument({ data: buffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map((item:any) => item.str).join(" ") + "\n";
      }
      return fullText;
    } catch (err) {
      console.error(err);
      return "";
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfError(null);
    setUploadStatus("uploading");

    // show thumbnail instantly
    const tmp = URL.createObjectURL(file);
    setThumbnail(tmp);
    await new Promise(r => setTimeout(r, 300));
    setUploadStatus("done");

    if (file.type === "application/pdf") {
      const buffer = await file.arrayBuffer();
      setFileUrl(new Blob([buffer], { type: "application/pdf" }));
      setFileText(await extractTextFromPDF(buffer));

    } else if (file.name.endsWith(".epub")) {
      const book = ePub(URL.createObjectURL(file));
      await book.ready;
      // grab first spine item
      const spineItem = book.spine.get(0)!;
      const section = await spineItem.load(book.load.bind(book));
      // use epubjs's .text() to extract plain text
      const text = await (section as any).text();
      setFileText(text);

    } else if (file.type.startsWith("image/")) {
      const { data: { text } } = await Tesseract.recognize(file, "eng");
      setFileText(text);

    } else {
      // .docx or .txt
      const reader = new FileReader();
      reader.onload = async ev => {
        const res = ev.target?.result;
        if (file.name.endsWith(".docx") && res instanceof ArrayBuffer) {
          const { value } = await mammoth.extractRawText({ arrayBuffer: res });
          setFileText(value);
        } else if (typeof res === "string") {
          setFileText(res);
        }
      };
      if (file.name.endsWith(".docx")) reader.readAsArrayBuffer(file);
      else reader.readAsText(file);
    }
  };

  const parseDocument = () => {
    if (!enabled || !fileText) return;
    setLoading(true);
    const parsed = improveBiomedicalParsing(fileText);
    // simulate async
    setTimeout(() => {
      setOutput(parsed);
      setLoading(false);
      document.getElementById("thought-output")?.scrollIntoView({ behavior: "smooth" });
    }, 500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-4xl">
        <h1 className="text-3xl font-bold mb-6 text-center">Thought-Unit Reader</h1>

        {!user ? (
          <Button className="w-full mb-6 bg-green-600 hover:bg-green-700">Sign in with Google</Button>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <Label htmlFor="toggleParser">Enable Parser</Label>
              <Switch id="toggleParser" checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="mb-4">
              <input
                type="file"
                accept=".pdf,.epub,.docx,.txt,.png,.jpg,.jpeg"
                onChange={handleFileChange}
                className="block w-full file:py-2 file:px-4 file:rounded-full file:bg-blue-50 file:text-blue-700"
              />
              {thumbnail && (
                <img src={thumbnail} className="mt-2 h-24 object-contain rounded" />
              )}
            </div>

            {uploadStatus === "uploading" && (
              <div className="p-2 bg-yellow-100 text-yellow-800 rounded mb-4">⏳ Uploading…</div>
            )}
            {uploadStatus === "done" && (
              <div className="p-2 bg-green-100 text-green-800 rounded mb-4">✅ Upload complete!</div>
            )}

            <Button
              onClick={parseDocument}
              className="w-full mb-6 bg-blue-600 hover:bg-blue-700 text-white rounded"
            >
              {loading ? "Parsing…" : "Start Parsing"}
            </Button>

            <div className="grid grid-cols-2 gap-4">
              {/* original viewer */}
              <div className="bg-gray-50 p-4 rounded overflow-auto max-h-[60vh]">
                <h2 className="font-semibold mb-2">📘 Original View</h2>
                {fileUrl ? (
                  <Document
                    file={fileUrl}
                    onLoadError={e => setPdfError((e as any).message)}
                    onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                  >
                    {Array.from({ length: numPages }).map((_, i) => (
                      <Page key={i} pageNumber={i+1} />
                    ))}
                  </Document>
                ) : (
                  <p className="italic text-gray-500">No PDF loaded.</p>
                )}
                {pdfError && <p className="text-red-500 mt-2">{pdfError}</p>}
              </div>

              {/* thought-unit output */}
              <div id="thought-output" className="bg-white p-4 rounded overflow-auto max-h-[60vh]">
                <div className="flex justify-between mb-2">
                  <h2 className="font-semibold">🧠 Thought-Unit Output</h2>
                  <Button onClick={() => setManualEditMode(!manualEditMode)}>
                    {manualEditMode ? "Disable Edit" : "Edit Output"}
                  </Button>
                </div>
                <div
                  className="whitespace-pre-wrap text-sm"
                  contentEditable={manualEditMode}
                  suppressContentEditableWarning
                >
                  {output ?? "No output yet. Enable parser and load a file to begin."}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}