import { useState, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import PDFViewer from "../components/PDFViewer";
import { cn } from "../lib/utils";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.js`;

export default function ThoughtUnitReader() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [formattedText, setFormattedText] = useState("");
  const [darkMode, setDarkMode] = useState(false);
  const [dyslexiaFont, setDyslexiaFont] = useState(false);
  const [parserEditMode, setParserEditMode] = useState(false);
  const [toc, setToc] = useState<string[]>([]);

  useEffect(() => {
    document.body.className = cn(
      darkMode ? "dark" : "light",
      dyslexiaFont && "dyslexia"
    );
  }, [darkMode, dyslexiaFont]);

  function parseThoughtUnits(input: string) {
    const lines = input.split(/(?<=\.|\?|!)\s+/g);
    return lines
      .map(
        (phrase, idx) =>
          `<span style="color:${idx % 2 === 0 ? "black" : "gray"}">${phrase}</span>`
      )
      .join(" ");
  }

  function extractTOC(text: string) {
    const lines = text.split("\n");
    return lines.filter((line) =>
      /chapter|section|unit|topic|lesson/i.test(line)
    );
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const raw = e.target.value;
    setText(raw);
    setFormattedText(parseThoughtUnits(raw));
    setToc(extractTOC(raw));
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-2">Thought-Unit Reader</h1>

      <div className="flex gap-4 items-center mb-4">
        <Label>
          Dark Mode
          <Switch checked={darkMode} onCheckedChange={setDarkMode} />
        </Label>
        <Label>
          Dyslexia Font
          <Switch checked={dyslexiaFont} onCheckedChange={setDyslexiaFont} />
        </Label>
        <Label>
          Parser Edit Mode
          <Switch checked={parserEditMode} onCheckedChange={setParserEditMode} />
        </Label>
      </div>

      <Input
        type="file"
        accept=".pdf,.txt"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />

      <textarea
        className="w-full h-40 mt-4 p-2 border rounded"
        placeholder="Paste or type content..."
        value={text}
        onChange={handleTextChange}
      />

      <h2 className="text-lg font-semibold mt-6">Formatted Thought-Units</h2>
      <div
        className="mt-2 border rounded p-4"
        dangerouslySetInnerHTML={{ __html: formattedText }}
      />

      {toc.length > 0 && (
        <>
          <h2 className="text-lg font-semibold mt-6">Table of Contents</h2>
          <ul className="list-disc pl-6 mt-2">
            {toc.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </>
      )}

      {file && (
        <>
          <h2 className="text-lg font-semibold mt-6">PDF Preview</h2>
          <PDFViewer file={file} />
        </>
      )}
    </div>
  );
}