import { useState, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import PDFViewer from "../components/PDFViewer"; // Optional: comment out if not using
import { cn } from "../lib/utils"; // ✅ Corrected import

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.js`;

export default function ThoughtUnitReader() {
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [formattedText, setFormattedText] = useState("");
  const [darkMode, setDarkMode] = useState(false);
  const [dyslexiaFont, setDyslexiaFont] = useState(false);
  const [parserEditMode, setParserEditMode] = useState(false);
  const [toc, setToc] = useState([]);

  useEffect(() => {
    document.body.className = darkMode ? "dark" : "light";
  }, [darkMode]);

  function parseThoughtUnits(input) {
    const lines = input.split(/(?<=\.|\?|\!)\s+/); // sentence-based
    return lines.map((phrase, idx) =>
      `<span style="color: ${idx % 2 === 0 ? 'black' : 'gray'};">${phrase.trim()}</span>`
    ).join(" ");
  }

  function extractTOC(text) {
    const lines = text.split("\n");
    return lines.filter(line =>
      line.toLowerCase().includes("chapter") ||
      line.toLowerCase().includes("section") ||
      line.toLowerCase().startsWith("part ")
    );
  }

  function onFileChange(e) {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = async () => {
      const content = reader.result;

      if (selectedFile.name.endsWith(".txt")) {
        setText(content);
        setFormattedText(parseThoughtUnits(content));
        setToc(extractTOC(content));
      } else {
        setText("PDF Loaded. View left panel. Thought-unit parsing pending OCR.");
      }
    };
    reader.readAsText(selectedFile);
  }

  return (
    <div className={cn("p-4", dyslexiaFont ? "font-[OpenDyslexic]" : "")}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Label>Dark Mode</Label>
          <Switch checked={darkMode} onCheckedChange={setDarkMode} />
          <Label>Dyslexia Font</Label>
          <Switch checked={dyslexiaFont} onCheckedChange={setDyslexiaFont} />
          <Label>Parser Override</Label>
          <Switch checked={parserEditMode} onCheckedChange={setParserEditMode} />
        </div>

        <Input type="file" accept=".pdf,.txt" onChange={onFileChange} />

        {file?.name.endsWith(".pdf") ? (
          <PDFViewer file={file} />
        ) : (
          <>
            <div dangerouslySetInnerHTML={{ __html: formattedText }} />
            <div className="mt-4">
              <h2 className="text-lg font-bold">Table of Contents</h2>
              <ul className="list-disc ml-6">
                {toc.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}