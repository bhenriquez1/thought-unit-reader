// pages/index.js
import { useState } from "react";
import dynamic from "next/dynamic";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.js`;

export default function ThoughtUnitReader() {
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [formatted, setFormatted] = useState("");
  const [numPages, setNumPages] = useState(null);

  function onFileChange(e) {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = async () => {
      const content = reader.result;
      if (selectedFile.name.endsWith(".txt")) {
        setText(content);
        setFormatted(parseText(content));
      } else {
        setText("PDF loaded. View left panel. Thought-unit parsing pending OCR.");
        setFormatted("PDF loaded. View left panel. Thought-unit parsing pending OCR.");
      }
    };

    if (selectedFile.name.endsWith(".txt")) {
      reader.readAsText(selectedFile);
    } else {
      reader.readAsArrayBuffer(selectedFile);
    }
  }

  function parseText(input) {
    const phrases = input.split(/([.!?]\s|\n)/g).filter(Boolean);
    let output = "";
    let toggle = true;
    for (let phrase of phrases) {
      let trimmed = phrase.trim();
      if (trimmed.length > 0) {
        output += `<span style=\"color: ${toggle ? 'black' : 'gray'};\">${trimmed} </span>`;
        toggle = !toggle;
      }
    }
    return output;
  }

  return (
    <div style={{ display: "flex", flexDirection: "row", height: "100vh" }}>
      {/* Left Panel – PDF Viewer */}
      <div style={{ width: "50%", height: "100%", overflow: "scroll", borderRight: "1px solid #ccc" }}>
        <h2>📘 Original Book View</h2>
        {file && file.type === "application/pdf" && (
          <Document
            file={file}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          >
            {Array.from(new Array(numPages), (el, index) => (
              <Page key={`page_${index + 1}`} pageNumber={index + 1} />
            ))}
          </Document>
        )}
      </div>

      {/* Right Panel – Thought-Unit View */}
      <div style={{ width: "50%", padding: "1rem", overflowY: "scroll" }}>
        <h2>🧠 Thought-Unit View</h2>
        <input type="file" accept=".pdf,.txt,.docx" onChange={onFileChange} />
        <div dangerouslySetInnerHTML={{ __html: formatted }} />
      </div>
    </div>
  );
}
