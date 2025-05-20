import { useEffect, useState } from "react";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import mammoth from "mammoth";
import { improveBiomedicalParsing } from "../lib/parser";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function Home() {
  const [enabled, setEnabled] = useState(false);
  const [parsingComplete, setParsingComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState<any>(null);
  const [fileText, setFileText] = useState<string>("");
  const [output, setOutput] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [manualEditMode, setManualEditMode] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done">("idle");

  const user = true;

  const handleUpload = async (file: File) => {
    setUploadStatus("uploading");
    await new Promise((r) => setTimeout(r, 500));
    setUploadStatus("done");
  };

  const parseDocument = () => {
    if (!enabled || !fileText) return;
    setLoading(true);
    setParsingComplete(false);

    const parsed = improveBiomedicalParsing(fileText);
    setTimeout(() => {
      setOutput(parsed);
      setParsingComplete(true);
      setLoading(false);
      setTimeout(() => {
        const rightPanel = document.getElementById("thought-output");
        if (rightPanel) rightPanel.scrollIntoView({ behavior: "smooth" });
      }, 300);
    }, 800);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    await handleUpload(file);

    if (file.type === "application/pdf") {
      const arrayBuffer = await file.arrayBuffer();
      setFileUrl({ data: new Uint8Array(arrayBuffer) });
      const text = await extractTextFromPDF(arrayBuffer);
      setFileText(text);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = e.target?.result;
      if (file.name.endsWith(".docx") && result) {
        const arrayBuffer = result as ArrayBuffer;
        const { value } = await mammoth.convertToPlainText({ arrayBuffer });
        setFileText(value);
      } else if (typeof result === "string") {
        setFileText(result);
      }
    };

    if (file.name.endsWith(".docx")) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  async function extractTextFromPDF(buffer: ArrayBuffer): Promise<string> {
    try {
      const pdf = await pdfjs.getDocument({ data: buffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(" ");
        fullText += pageText + "\n";
      }
      return fullText;
    } catch (error) {
      console.error("Error extracting text from PDF:", error);
      return "";
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6">
      <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-6xl">
        <h1 className="text-3xl font-bold mb-6 text-center">Thought-Unit Reader</h1>

        {!user && (
          <Button className="mb-6 w-full bg-green-600 hover:bg-green-700">
            Sign in with Google
          </Button>
        )}

        {user && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <Label htmlFor="toggleParser" className="text-gray-700">Enable Parser</Label>
              <Switch id="toggleParser" checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="mb-4">
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            {uploadStatus === "uploading" && (
              <div className="mt-4 p-2 bg-yellow-100 text-yellow-800 rounded-xl">
                ⏳ Uploading file...
              </div>
            )}

            {uploadStatus === "done" && (
              <div className="mt-4 p-2 bg-green-100 text-green-800 rounded-xl">
                ✅ Upload complete!
              </div>
            )}

            <Button
              onClick={parseDocument}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition"
            >
              {loading ? "Parsing..." : "Start Parsing"}
            </Button>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-xl overflow-auto max-h-[80vh]">
                <h2 className="text-xl font-semibold mb-2">📘 Original Book View</h2>
                {fileUrl ? (
                  <Document file={fileUrl} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
                    {Array.from(new Array(numPages), (el, index) => (
                      <Page key={`page_${index + 1}`} pageNumber={index + 1} />
                    ))}
                  </Document>
                ) : (
                  <p className="text-sm italic text-gray-500">Failed to load PDF file.</p>
                )}
              </div>

              <div id="thought-output" className="bg-white p-4 rounded-xl shadow-inner overflow-y-auto max-h-[80vh]">
                <div className="flex justify-between mb-2">
                  <h2 className="text-xl font-semibold">🧠 Thought-Unit Output</h2>
                  <Button onClick={() => setManualEditMode(!manualEditMode)}>
                    {manualEditMode ? "Disable Edit" : "Improve Parser"}
                  </Button>
                </div>
                <div
                  className="text-gray-700 whitespace-pre-wrap text-sm"
                  contentEditable={manualEditMode}
                  suppressContentEditableWarning
                  dangerouslySetInnerHTML={{ __html: output || "No output yet. Start the parser to generate content." }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
