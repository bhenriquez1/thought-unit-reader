// pages/index.tsx - Universal Academic Text Analyzer
import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

import { improveBiomedicalParsing } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";

// Configure PDF.js worker with reliable CDN
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "none";

export default function Home() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  
  // PDF-specific states
  const [fileType, setFileType] = useState<FileType>("none");
  const [pdfFile, setPdfFile] = useState<Blob | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [fileName, setFileName] = useState("");

  // Universal academic sample texts
  const sampleTexts = {
    science: `The scientific method involves forming a hypothesis, designing an experiment with proper control groups, and analyzing data to test predictions. Variables must be carefully controlled to ensure valid results. Peer review ensures that scientific findings are reliable and reproducible through replication.`,
    
    mathematics: `A function is a mathematical relationship between input and output values. The derivative of a function represents its rate of change, while the integral represents the area under the curve. These concepts form the foundation of calculus and are used to solve complex equations and prove mathematical theorems.`,
    
    literature: `The author uses symbolism and metaphor to convey deeper meaning in the narrative. Characterization develops through dialogue and actions, while foreshadowing hints at future events. The protagonist's journey represents a universal theme about human nature and the conflict between individual desires and social expectations.`,
    
    history: `Primary sources provide direct evidence from historical periods, while secondary sources offer analysis and interpretation of events. Understanding causation and chronology helps historians reconstruct civilizations and trace the development of democratic institutions through different revolutionary periods.`,
    
    philosophy: `Epistemology examines how we acquire knowledge and what constitutes valid reasoning. The question of free will versus determinism has implications for ethics and moral responsibility. Logic provides the framework for analyzing arguments and distinguishing valid conclusions from fallacious reasoning.`,
    
    psychology: `Cognitive psychology studies mental processes including memory, perception, and learning. Conditioning experiments demonstrate how behavior can be modified through association. Research on neuroplasticity shows that the brain can reorganize itself, challenging earlier assumptions about fixed neural pathways.`,
    
    economics: `Supply and demand determine market prices in a capitalist economy. Inflation occurs when there is too much money chasing too few goods. GDP measures economic output, while fiscal policy involves government decisions about taxation and spending to influence economic growth and employment.`,
    
    biology: `Evolution through natural selection explains the diversity of life on Earth. DNA contains genetic information that is replicated during cell division. Ecosystems maintain balance through complex interactions between organisms and their environment, including processes like photosynthesis that convert solar energy into chemical energy.`
  };

  // Helper to extract text from PDF
  const extractTextFromPDF = useCallback(async (buffer: ArrayBuffer): Promise<string> => {
    try {
      const pdf = await pdfjs.getDocument({ 
        data: buffer,
        cMapUrl: `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/cmaps/`,
        cMapPacked: true,
      }).promise;
      
      let fullText = "";
      const maxPages = Math.min(pdf.numPages, 50); // Limit for performance
      
      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: any) => item.str)
          .join(" ");
        fullText += pageText + "\n\n";
      }
      return fullText.trim();
    } catch (err) {
      console.error("PDF extraction error:", err);
      throw new Error(`Failed to extract text from PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, []);

  // Handle text input change
  const handleTextChange = useCallback((text: string) => {
    setInputText(text);
    setError(null);
    setOutput(null);
    setFileType("text");
  }, []);

  // Load sample text
  const loadSampleText = useCallback((sampleKey: keyof typeof sampleTexts) => {
    const text = sampleTexts[sampleKey];
    setInputText(text);
    setError(null);
    setOutput(null);
    setFileType("text");
    setPdfFile(null);
    setFileName(`Sample: ${sampleKey}`);
  }, []);

  // Handle file upload with PDF support
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset states
    setError(null);
    setUploadStatus("uploading");
    setFileName(file.name);
    setOutput(null);

    try {
      // File size check (100MB limit)
      if (file.size > 100 * 1024 * 1024) {
        throw new Error("File too large. Please select a file smaller than 100MB.");
      }

      await new Promise(resolve => setTimeout(resolve, 300));
      setUploadStatus("processing");

      let extractedText = "";

      if (file.type === "application/pdf") {
        const buffer = await file.arrayBuffer();
        const pdfBlob = new Blob([buffer], { type: "application/pdf" });
        setPdfFile(pdfBlob);
        setFileType("pdf");
        extractedText = await extractTextFromPDF(buffer);

      } else if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
        extractedText = await file.text();
        setFileType("text");
        setPdfFile(null);

      } else {
        throw new Error(`Unsupported file type: ${file.type || file.name.split('.').pop()}. Please upload PDF or TXT files.`);
      }

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error("No text content found in the file. Please try a different file.");
      }

      setInputText(extractedText);
      setUploadStatus("done");

    } catch (err) {
      console.error("File processing error:", err);
      setError(err instanceof Error ? err.message : "Failed to process file");
      setUploadStatus("error");
      setInputText("");
      setPdfFile(null);
      setFileType("none");
    }
  }, [extractTextFromPDF]);

  // Parse the text
  const parseText = useCallback(() => {
    if (!enabled) {
      setError("Please enable the academic text analyzer first");
      return;
    }
    
    if (!inputText.trim()) {
      setError("Please enter some text, upload a file, or load a sample to analyze");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setTimeout(() => {
        const parsed = improveBiomedicalParsing(inputText);
        setOutput(parsed);
        setLoading(false);
        
        setTimeout(() => {
          document.getElementById("parser-output")?.scrollIntoView({ 
            behavior: "smooth",
            block: "start"
          });
        }, 100);
      }, 800);

    } catch (err) {
      console.error("Parsing error:", err);
      setError("Failed to parse text. Please try again.");
      setLoading(false);
    }
  }, [enabled, inputText]);

  const getStatusColor = (status: UploadStatus) => {
    switch (status) {
      case "uploading": return "bg-blue-100 text-blue-800";
      case "processing": return "bg-yellow-100 text-yellow-800";
      case "done": return "bg-green-100 text-green-800";
      case "error": return "bg-red-100 text-red-800";
      default: return "";
    }
  };

  const getStatusMessage = (status: UploadStatus) => {
    switch (status) {
      case "uploading": return "📤 Uploading file...";
      case "processing": return "⚙️ Processing content...";
      case "done": return "✅ File processed successfully!";
      case "error": return "❌ Upload failed";
      default: return "";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">📚 Universal Academic Text Analyzer</h1>
          <p className="text-gray-600">Intelligent analysis for ALL academic subjects and textbooks</p>
          <p className="text-sm text-gray-500 mt-1">Science • Math • Literature • History • Philosophy • Psychology • Economics • Art</p>
        </div>

        {/* Controls Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-3">
              <Label htmlFor="toggleParser" className="text-lg font-medium">
                🎓 Academic Text Analyzer
              </Label>
              <Switch 
                id="toggleParser" 
                checked={enabled} 
                onCheckedChange={setEnabled} 
              />
            </div>
            <div className="text-sm text-gray-500">
              {inputText.length > 0 && (
                <span>
                  📊 {inputText.length.toLocaleString()} characters | {Math.round(inputText.length / 5)} words
                  {fileName && <span className="ml-2">| 📄 {fileName}</span>}
                </span>
              )}
            </div>
          </div>

          {/* Sample Text Buttons */}
          <div className="mb-6">
            <Label className="block text-sm font-medium mb-3">🎯 Try Different Academic Subjects:</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Button
                onClick={() => loadSampleText('science')}
                variant="outline"
                size="sm"
                className="text-left"
              >
                🔬 Science
              </Button>
              <Button
                onClick={() => loadSampleText('mathematics')}
                variant="outline"
                size="sm"
                className="text-left"
              >
                📐 Mathematics
              </Button>
              <Button
                onClick={() => loadSampleText('literature')}
                variant="outline"
                size="sm"
                className="text-left"
              >
                📖 Literature
              </Button>
              <Button
                onClick={() => loadSampleText('history')}
                variant="outline"
                size="sm"
                className="text-left"
              >
                🏛️ History
              </Button>
              <Button
                onClick={() => loadSampleText('philosophy')}
                variant="outline"
                size="sm"
                className="text-left"
              >
                🤔 Philosophy
              </Button>
              <Button
                onClick={() => loadSampleText('psychology')}
                variant="outline"
                size="sm"
                className="text-left"
              >
                🧠 Psychology
              </Button>
              <Button
                onClick={() => loadSampleText('economics')}
                variant="outline"
                size="sm"
                className="text-left"
              >
                💰 Economics
              </Button>
              <Button
                onClick={() => loadSampleText('biology')}
                variant="outline"
                size="sm"
                className="text-left"
              >
                🧬 Biology
              </Button>
            </div>
          </div>

          {/* File Upload - Universal for all textbooks */}
          <div className="mb-6">
            <Label className="block text-sm font-medium mb-2">
              📄 Upload Any Academic Document (PDF or TXT files)
            </Label>
            <input
              type="file"
              accept=".pdf,.txt"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
            <div className="mt-2 text-xs text-gray-500">
              💡 Upload textbooks, research papers, lecture notes, or any academic content
            </div>
          </div>

          {/* Status Messages */}
          {uploadStatus !== "idle" && (
            <div className={`p-3 rounded-lg mb-4 ${getStatusColor(uploadStatus)}`}>
              {getStatusMessage(uploadStatus)}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-100 text-red-800 rounded-lg mb-4">
              ⚠️ {error}
            </div>
          )}

          {/* Parse Button */}
          <Button
            onClick={parseText}
            disabled={!enabled || !inputText.trim() || loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-4 text-lg"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Analyzing academic content...
              </span>
            ) : (
              "🎓 Analyze Academic Text"
            )}
          </Button>
        </div>

        {/* Content Display */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Source Display */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h2 className="font-semibold text-lg mb-4 flex items-center">
              {fileType === "pdf" ? "📄 PDF Document" : fileType === "text" ? "📝 Text Content" : "📁 Input Source"}
              {numPages > 0 && (
                <span className="ml-2 text-sm text-gray-500">
                  ({numPages} pages)
                </span>
              )}
            </h2>
            
            <div className="max-h-96 overflow-auto border rounded-lg bg-gray-50">
              {fileType === "pdf" && pdfFile ? (
                <Document
                  file={pdfFile}
                  onLoadError={(err) => {
                    console.error("PDF display error:", err);
                    setError(`PDF Display Error: ${err.message || 'Failed to display PDF'}`);
                  }}
                  onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                  className="w-full"
                >
                  {Array.from({ length: Math.min(numPages, 3) }).map((_, i) => (
                    <Page 
                      key={i} 
                      pageNumber={i + 1}
                      className="mb-4"
                      width={400}
                      renderAnnotationLayer={false}
                      renderTextLayer={false}
                    />
                  ))}
                  {numPages > 3 && (
                    <div className="text-center p-4 text-gray-500">
                      📚 ... and {numPages - 3} more pages (showing first 3 for performance)
                    </div>
                  )}
                </Document>
              ) : inputText ? (
                <>
                  <div className="mb-4 p-4">
                    <Label className="block text-sm font-medium mb-2">
                      Enter or paste your academic text:
                    </Label>
                    <textarea
                      value={inputText}
                      onChange={(e) => handleTextChange(e.target.value)}
                      placeholder="Paste academic text here, upload a PDF, or use the sample buttons above..."
                      className="w-full h-64 p-4 border border-gray-300 rounded-lg text-sm leading-relaxed resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-gray-500">
                  <div className="text-4xl mb-4">📚</div>
                  <p className="text-lg font-medium">Upload any academic document</p>
                  <p className="text-sm mt-2">
                    Works with textbooks from any subject
                  </p>
                  <div className="mt-4 text-xs text-gray-400 grid grid-cols-2 gap-1">
                    <div>🔬 Science Textbooks</div>
                    <div>📐 Math Textbooks</div>
                    <div>📖 Literature Books</div>
                    <div>🏛️ History Books</div>
                    <div>🤔 Philosophy Texts</div>
                    <div>🧠 Psychology Books</div>
                    <div>💰 Economics Texts</div>
                    <div>🎨 Art History Books</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Parser Output */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold text-lg">🎓 Academic Analysis</h2>
            </div>
            
            <div 
              id="parser-output"
              className="min-h-96 max-h-96 overflow-auto border rounded-lg p-4 bg-gray-50"
            >
              {output ? (
                <div
                  className="text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: output }}
                />
              ) : (
                <div className="text-center text-gray-500 py-16">
                  <div className="text-4xl mb-4">🎓</div>
                  <p className="text-lg font-medium">Universal analysis results</p>
                  <p className="text-sm mt-2">
                    Upload any textbook, enter text, or use samples, then click "Analyze"
                  </p>
                  <div className="mt-6 text-xs text-gray-400 space-y-1">
                    <div>🔬 Science terms highlighted in blue</div>
                    <div>📐 Math concepts highlighted in purple</div>
                    <div>📖 Literature terms highlighted in green</div>
                    <div>🏛️ History concepts highlighted in red</div>
                    <div>🤔 Philosophy terms highlighted in indigo</div>
                    <div>🧠 Psychology terms highlighted in pink</div>
                    <div>💰 Economics terms highlighted in amber</div>
                    <div>🎨 Art terms highlighted in teal</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>🎯 Works with ALL academic subjects | 📚 Automatic subject detection | 🎓 Academic level assessment | 🔍 Intelligent thought-unit analysis</p>
        </div>
      </div>
    </div>
  );
}