// pages/index.tsx
import { useEffect, useState } from "react";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import mammoth from "mammoth";
import { improveBiomedicalParsing } from "../lib/parser";
import Tesseract from "tesseract.js";
import ePub from "epubjs";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function Home() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState<Blob | null>(null);
  const [fileText, setFileText] = useState<string>("");
  const [output, setOutput] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [manualEditMode, setManualEditMode] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done">("idle");
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  const user = true; // stubbed auth

  const handleUpload = async (file: File) => {
    setUploadStatus("uploading");
    setThumbnail(URL.createObjectURL(file));
    await new Promise((r) => setTimeout(r, 500));
    setUploadStatus("done");
  };

  const parseDocument = () => {
    if (!enabled || !fileText) return;
    setLoading(true);
    const parsed = improveBiomedicalParsing(fileText);
    setTimeout(() => {
      setOutput(parsed);
      setLoading(false);
      document.getElementById("thought-output")?.scrollIntoView({ behavior: "smooth" });
    }, 800);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setPdfError(null);
    await handleUpload(file);

    if (file.type === "application/pdf") {
      // PDF branch
      const buffer = await file.arrayBuffer();
      setFileUrl(new Blob([buffer], { type: "application/pdf" }));
      setFileText(await extractTextFromPDF(buffer));

    } else if (file.name.endsWith(".epub")) {
      // EPUB branch
      const book = ePub(URL.createObjectURL(file));
      await book.ready;
      const spineItem = book.spine.get(0)!;
      // load() returns a Document instance
      const sectionDoc = (await spineItem.load(book.load.bind(book))) as Document;
      setFileText(sectionDoc.body.textContent || "");

    } else if (file.type.startsWith("image/")) {
      // OCR branch
      const { data: { text } } = await Tesseract.recognize(file, "eng");
      setFileText(text);

    } else {
      // DOCX / TXT branch
      const reader = new FileReader();
      reader.onload = async (ev) => {
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

  async function extractTextFromPDF(buffer: ArrayBuffer): Promise<string> {
    try {
      const pdf = await pdfjs.getDocument({ data: buffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map((item: any) => item.str).join(" ") + "\n";
      }
      return fullText;
    } catch (err) {
      console.error(err);
      return "";
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6">
      <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-6xl">
        <h1 className="text-3xl font-bold mb-6 text-center">Thought-Unit Reader</h1>

        {!user ? (
          <Button className="mb-6 w-full bg-green-600 hover:bg-green-700">
            Sign in with Google
          </Button>
        ) : (
          <>
            {/* Parser toggle */}
            <div className="mb-4 flex items-center justify-between">
              <Label htmlFor="toggleParser">Enable Parser</Label>
              <Switch
                id="toggleParser"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>

            {/* File input + thumbnail */}
            <div className="mb-4">
              <input
                type="file"
                accept=".pdf,.docx,.txt,.epub,.png,.jpg,.jpeg"
                onChange={handleFileChange}
                className="block w-full file:py-2 file:px-4 file:rounded-full file:bg-blue-50 file:text-blue-700"
              />
              {thumbnail && (
                <img
                  src={thumbnail}
                  alt="Preview"
                  className="mt-2 h-20 object-contain rounded"
                />
              )}
            </div>

            {/* Upload status */}
            {uploadStatus === "uploading" && (
              <div className="p-2 bg-yellow-100 text-yellow-800 rounded-xl">
                ⏳ Uploading file...
              </div>
            )}
            {uploadStatus === "done" && (
              <div className="p-2 bg-green-100 text-green-800 rounded-xl">
                ✅ Upload complete!
              </div>
            )}

            {/* Parse button */}
            <Button
              onClick={parseDocument}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
            >
              {loading ? "Parsing..." : "Start Parsing"}
            </Button>

            {/* Two-column view */}
            <div className="mt-6 grid grid-cols-2 gap-4">
              {/* PDF / EPUB viewer */}
              <div className="bg-gray-50 p-4 rounded-xl overflow-auto max-h-[80vh]">
                <h2 className="text-xl font-semibold mb-2">
                  📘 Original Book View
                </h2>
                {fileUrl ? (
                  <Document
                    file={fileUrl}
                    onLoadError={(err) => setPdfError(err.message)}
                    onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                  >
                    {Array.from({ length: numPages }).map((_, i) => (
                      <Page key={i} pageNumber={i + 1} />
                    ))}
                  </Document>
                ) : (
                  <p className="italic text-gray-500">No file loaded.</p>
                )}
                {pdfError && (
                  <p className="text-red-500 mt-2">❌ {pdfError}</p>
                )}
              </div>

              {/* Thought-Unit output */}
              <div
                id="thought-output"
                className="bg-white p-4 rounded-xl overflow-y-auto max-h-[80vh]"
              >
                <div className="flex justify-between mb-2">
                  <h2 className="text-xl font-semibold">
                    🧠 Thought-Unit Output
                  </h2>
                  <Button onClick={() => setManualEditMode(!manualEditMode)}>
                    {manualEditMode ? "Disable Edit" : "Improve Parser"}
                  </Button>
                </div>
                <div
                  className="whitespace-pre-wrap text-sm"
                  contentEditable={manualEditMode}
                  suppressContentEditableWarning
                  dangerouslySetInnerHTML={{
                    __html:
                      output ||
                      "No output yet. Enable parser and load a file to start.",
                  }}
                />
              </div>
            </div>

            {/* EPUB viewer placeholder */}
            <div id="viewer" className="hidden" />
          </>
        )}
      </div>
    </div>
  );
}