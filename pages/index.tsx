// pages/index.tsx - Right Brain Reading Interface
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

  // Sample texts from various book types (preserving original content)
  const sampleTexts = {
    velveteen: `There was once a velveteen rabbit, and in the beginning he was really splendid. He was fat and bunchy, as a rabbit should be; his coat was spotted brown and white, he had real thread whiskers, and his ears were lined with pink sateen. On Christmas morning, when he sat wedged in the top of the Boy's stocking, with a sprig of holly between his paws, the effect was charming.`,
    
    mystery: `The room was in darkness when Detective Morrison arrived at the scene. A single lamp cast eerie shadows across the mahogany desk where the victim had been found. The butler, trembling with nerves, led him through the mansion's corridors. "Nothing has been disturbed, sir," he whispered, his voice echoing in the vast hallway. "Everything is exactly as we found it this morning."`,
    
    science: `Photosynthesis is the process by which plants convert sunlight into chemical energy. Chlorophyll molecules in the plant's leaves absorb light energy and use it to combine carbon dioxide from the air with water from the roots. This remarkable process not only feeds the plant but also produces oxygen as a byproduct, which is essential for most life on Earth.`,
    
    history: `The Industrial Revolution began in Britain during the late 18th century and fundamentally changed human society. Steam engines powered new factories, while railways connected distant cities for the first time. Workers left rural farms to seek employment in rapidly growing urban centers. This transformation brought both unprecedented prosperity and significant social challenges that would shape the modern world.`,
    
    biography: `Marie Curie was born in Warsaw in 1867, during a time when Poland was under Russian occupation. Despite facing numerous obstacles as a woman in science, she became the first person to win Nobel Prizes in two different scientific fields. Her groundbreaking research on radioactivity opened new frontiers in physics and chemistry, though the dangers of radiation exposure were not yet understood.`,
    
    philosophy: `What is the nature of consciousness? This question has puzzled philosophers for centuries. Some argue that consciousness emerges from complex neural activity in the brain, while others believe it represents something beyond mere physical processes. The hard problem of consciousness challenges us to explain how subjective experience arises from objective matter.`,
    
    literature: `In the dim light of dawn, Elizabeth walked through the garden paths of Pemberley. The morning mist clung to the ancient oak trees, and dewdrops sparkled on the rose petals like tiny diamonds. She had never imagined that circumstances would bring her to this place again, yet here she stood, her heart filled with emotions she dared not name.`,
    
    adventure: `The ship creaked and groaned as massive waves crashed over the deck. Captain Hayes gripped the wheel with white knuckles, his eyes scanning the horizon for any sign of land. The storm had been raging for three days now, and supplies were running dangerously low. "Hold fast, men!" he shouted over the howling wind. "We'll weather this storm yet!"`
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

  // Parse the text using Right Brain methodology
  const parseText = useCallback(() => {
    if (!enabled) {
      setError("Please enable the Right Brain analyzer first");
      return;
    }
    
    if (!inputText.trim()) {
      setError("Please enter some text, upload a book, or load a sample to analyze");
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
      }, 1000); // Slightly longer for the "processing" effect

    } catch (err) {
      console.error("Parsing error:", err);
      setError("Failed to create thought units. Please try again.");
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
      case "uploading": return "📤 Uploading book...";
      case "processing": return "🧠 Extracting content...";
      case "done": return "✅ Book loaded successfully!";
      case "error": return "❌ Upload failed";
      default: return "";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent mb-3">
            📚 Right Brain Reading
          </h1>
          <p className="text-xl text-gray-700 font-medium">Read Faster by Reading Ideas Instead of Just Words</p>
          <p className="text-sm text-gray-600 mt-2">Transform any book into thought-units for enhanced comprehension and speed</p>
        </div>

        {/* Controls Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6 border border-orange-200">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-3">
              <Label htmlFor="toggleParser" className="text-lg font-medium text-gray-800">
                🧠 Right Brain Analyzer
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
            <Label className="block text-sm font-medium mb-3 text-gray-700">📖 Try Different Book Styles:</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Button
                onClick={() => loadSampleText('velveteen')}
                variant="outline"
                size="sm"
                className="text-left hover:bg-orange-50 border-orange-200"
              >
                🐰 Children's Story
              </Button>
              <Button
                onClick={() => loadSampleText('mystery')}
                variant="outline"
                size="sm"
                className="text-left hover:bg-orange-50 border-orange-200"
              >
                🔍 Mystery Novel
              </Button>
              <Button
                onClick={() => loadSampleText('science')}
                variant="outline"
                size="sm"
                className="text-left hover:bg-orange-50 border-orange-200"
              >
                🔬 Science Book
              </Button>
              <Button
                onClick={() => loadSampleText('history')}
                variant="outline"
                size="sm"
                className="text-left hover:bg-orange-50 border-orange-200"
              >
                🏛️ History Text
              </Button>
              <Button
                onClick={() => loadSampleText('biography')}
                variant="outline"
                size="sm"
                className="text-left hover:bg-orange-50 border-orange-200"
              >
                👤 Biography
              </Button>
              <Button
                onClick={() => loadSampleText('philosophy')}
                variant="outline"
                size="sm"
                className="text-left hover:bg-orange-50 border-orange-200"
              >
                🤔 Philosophy
              </Button>
              <Button
                onClick={() => loadSampleText('literature')}
                variant="outline"
                size="sm"
                className="text-left hover:bg-orange-50 border-orange-200"
              >
                📖 Classic Literature
              </Button>
              <Button
                onClick={() => loadSampleText('adventure')}
                variant="outline"
                size="sm"
                className="text-left hover:bg-orange-50 border-orange-200"
              >
                ⛵ Adventure Story
              </Button>
            </div>
          </div>

          {/* File Upload */}
          <div className="mb-6">
            <Label className="block text-sm font-medium mb-2 text-gray-700">
              📄 Upload Any Book or Document (PDF or TXT files)
            </Label>
            <input
              type="file"
              accept=".pdf,.txt"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer"
            />
            <div className="mt-2 text-xs text-gray-500">
              💡 Upload novels, textbooks, research papers, or any reading material
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
            className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:bg-gray-400 text-white font-medium py-4 text-lg shadow-lg"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Creating thought units...
              </span>
            ) : (
              "🧠 Create Right Brain Reading Format"
            )}
          </Button>
        </div>

        {/* Content Display */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Source Display */}
          <div className="bg-white rounded-2xl shadow-xl p-6 border border-orange-200">
            <h2 className="font-semibold text-lg mb-4 flex items-center text-gray-800">
              {fileType === "pdf" ? "📄 Original PDF" : fileType === "text" ? "📝 Original Text" : "📚 Book Content"}
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
                    <Label className="block text-sm font-medium mb-2 text-gray-700">
                      Enter or paste your book content:
                    </Label>
                    <textarea
                      value={inputText}
                      onChange={(e) => handleTextChange(e.target.value)}
                      placeholder="Paste book content here, upload a PDF, or use the sample buttons above..."
                      className="w-full h-64 p-4 border border-orange-200 rounded-lg text-sm leading-relaxed resize-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-gray-500">
                  <div className="text-4xl mb-4">📚</div>
                  <p className="text-lg font-medium">Upload any book or document</p>
                  <p className="text-sm mt-2">
                    Transform traditional text into Right Brain reading format
                  </p>
                  <div className="mt-4 text-xs text-gray-400 grid grid-cols-2 gap-1">
                    <div>📖 Fiction & Literature</div>
                    <div>📚 Non-fiction Books</div>
                    <div>🔬 Textbooks</div>
                    <div>📄 Research Papers</div>
                    <div>📰 Articles & Essays</div>
                    <div>🗞️ News & Reports</div>
                    <div>📝 Study Materials</div>
                    <div>📋 Any Text Content</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Brain Output */}
          <div className="bg-white rounded-2xl shadow-xl p-6 border border-orange-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold text-lg text-gray-800">🧠 Right Brain Format</h2>
            </div>
            
            <div 
              id="parser-output"
              className="min-h-96 max-h-96 overflow-auto border border-orange-200 rounded-lg p-4 bg-gradient-to-br from-orange-50 to-amber-50"
            >
              {output ? (
                <div
                  className="text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: output }}
                />
              ) : (
                <div className="text-center text-gray-500 py-16">
                  <div className="text-4xl mb-4">🧠</div>
                  <p className="text-lg font-medium">Right Brain reading format</p>
                  <p className="text-sm mt-2">
                    Upload a book, enter text, or use samples, then click "Create Format"
                  </p>
                  <div className="mt-6 text-xs text-gray-400 space-y-2">
                    <div className="font-semibold">Right Brain Method Benefits:</div>
                    <div>🚀 Read 2-3x faster with better comprehension</div>
                    <div>🎯 Focus on ideas instead of individual words</div>
                    <div>🧠 Engage visual thinking for better retention</div>
                    <div>📚 Preserve original content completely intact</div>
                    <div>⚡ Reduce eye strain and reading fatigue</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>🎯 Based on "Reading with the Right Brain" methodology | 📚 Preserves original book content | 🧠 Optimized for comprehension and speed | ⚡ Transform any reading material</p>
        </div>
      </div>
    </div>
  );
}