import { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import PDFViewer from '../components/PDFViewer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function ThoughtUnitReader() {
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [formattedText, setFormattedText] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [dyslexiaFont, setDyslexiaFont] = useState(false);
  const [parserEditMode, setParserEditMode] = useState(false);
  const [toc, setToc] = useState([]);

  useEffect(() => {
    document.body.className = darkMode ? 'dark' : '';
  }, [darkMode]);

  function parseThoughtUnits(input) {
    const lines = input.split(/(?<=[.!?])\s+/g);
    let output = "";
    lines.forEach((phrase, idx) => {
      output += `<span style='color: ${idx % 2 === 0 ? 'black' : 'gray'};'>${phrase}</span> `;
    });
    return output;
  }

  function extractTOC(text) {
    const lines = text.split('\n');
    return lines.filter(line => /chapter|section|unit|topic/i.test(line)).slice(0, 20);
  }

  function handleFileUpload(e) {
    const uploadedFile = e.target.files[0];
    const reader = new FileReader();

    reader.onload = function () {
      const content = reader.result;
      setText(content);
      setFormattedText(parseThoughtUnits(content));
      setToc(extractTOC(content));
    };

    if (uploadedFile.name.endsWith('.pdf')) {
      reader.readAsText(uploadedFile); // OCR alternative coming later
    } else {
      reader.readAsText(uploadedFile);
    }
  }

  return (
    <div className={`min-h-screen flex ${darkMode ? 'bg-black text-white' : 'bg-white text-black'} ${dyslexiaFont ? 'font-[OpenDyslexic]' : ''}`}>

      {/* Left Panel: PDF/TOC */}
      <div className="w-1/2 p-4 space-y-4 overflow-y-scroll border-r">
        <h2 className="text-lg font-semibold">📖 Table of Contents</h2>
        <ul className="list-disc list-inside space-y-1 text-sm">
          {toc.map((line, idx) => (
            <li key={idx}>{line}</li>
          ))}
        </ul>
      </div>

      {/* Right Panel: Thought-Unit View */}
      <div className="w-1/2 p-4 space-y-4 overflow-y-scroll">
        <div className="flex space-x-4 items-center">
          <Label>🌙 Dark Mode</Label>
          <Switch checked={darkMode} onCheckedChange={setDarkMode} />
          <Label>🧠 Dyslexia Font</Label>
          <Switch checked={dyslexiaFont} onCheckedChange={setDyslexiaFont} />
          <Label>🛠 Improve Parser</Label>
          <Switch checked={parserEditMode} onCheckedChange={setParserEditMode} />
        </div>

        <Input type="file" onChange={handleFileUpload} accept=".txt,.pdf,.docx" />

        <div className="border mt-4 p-4 rounded bg-zinc-100 dark:bg-zinc-800">
          <div dangerouslySetInnerHTML={{ __html: formattedText }} />
        </div>
      </div>
    </div>
  );
}
