// pages/index.tsx

import { useEffect, useState } from "react";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
// Firebase temporarily excluded
// import { auth, provider, db, storage } from "../lib/firebase";
// import {
//   onAuthStateChanged,
//   signInWithPopup,
//   signInWithRedirect,
//   getRedirectResult,
// } from "firebase/auth";
// import {
//   doc,
//   getDoc,
//   setDoc,
// } from "firebase/firestore";
// import {
//   ref,
//   uploadBytes,
//   getDownloadURL,
// } from "firebase/storage";
import { improveBiomedicalParsing } from "../lib/parser";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

function extractTOC(text: string): string[] {
  return Array.from(
    text.matchAll(/^(Chapter|Section|\d+(\.\d+)*)[^\n]{0,80}/gim)
  ).map(match => match[0].trim());
}

export default function Home() {
  const [enabled, setEnabled] = useState(false);
  const [parsingComplete, setParsingComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string>("");
  const [output, setOutput] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [manualEditMode, setManualEditMode] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done">("idle");

  // Firebase login disabled
  const user = true;

  const handleUpload = async (file: File) => {
    setUploadStatus("uploading");
    await new Promise((r) => setTimeout(r, 500));
    setUploadStatus("done");
    return URL.createObjectURL(file);
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
    if (file) {
      setFileName(file.name);
      const url = URL.createObjectURL(file);
      setFileUrl(url);

      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result;
        if (typeof text === "string") {
          setFileText(text);
          await handleUpload(file);
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6">
      <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-6xl">
        <h1 className="text-2xl font-bold mb-6 text-center">Thought-Unit Reader</h1>

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

            {fileText && (
              <div className="my-6 bg-white p-4 rounded-xl shadow">
                <h2 className="font-semibold text-lg mb-2">📚 Table of Contents</h2>
                <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
                  {extractTOC(fileText).map((heading, index) => (
                    <li key={index} className="text-blue-700">🔹 {heading}</li>
                  ))}
                </ul>
              </div>
            )}

            {parsingComplete && (
              <div className="mt-4 p-4 bg-green-100 text-green-800 rounded-xl">
                ✅ Parsing complete!
              </div>
            )}

            {fileUrl && (
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-xl overflow-auto max-h-[80vh]">
                  <h2 className="text-lg font-semibold mb-2">📘 Original Book View</h2>
                  <Document file={fileUrl} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
                    {Array.from(new Array(numPages), (el, index) => (
                      <Page key={`page_${index + 1}`} pageNumber={index + 1} />
                    ))}
                  </Document>
                </div>

                <div id="thought-output" className="bg-white p-4 rounded-xl shadow-inner overflow-y-auto max-h-[80vh]">
                  <div className="flex justify-between mb-2">
                    <h2 className="text-lg font-semibold">🧠 Thought-Unit Output</h2>
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
            )}
          </>
        )}
      </div>
    </div>
  );
}
