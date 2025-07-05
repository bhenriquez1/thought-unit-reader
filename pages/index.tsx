// pages/index.tsx - Parser-Focused Version
import { useState, useCallback } from "react";
import { improveBiomedicalParsing } from "../lib/parser";

import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";

type UploadStatus = "idle" | "processing" | "done" | "error";

export default function Home() {
  const [enabled, setEnabled] = useState(true); // Default enabled for testing
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Sample biochemistry text for testing
  const sampleTexts = {
    enzymes: `Enzymes are biological catalysts that accelerate biochemical reactions. The enzyme-substrate complex forms when a substrate binds to the enzyme's active site. Michaelis-Menten kinetics describes the rate of enzymatic reactions. ATP synthase is crucial for oxidative phosphorylation in mitochondria. The rate-limiting step often determines the overall reaction speed.`,
    
    metabolism: `Glycolysis is the metabolic pathway that converts glucose into pyruvate. The citric acid cycle, also known as the Krebs cycle, occurs in mitochondria. NADH and FADH2 are important electron carriers in cellular respiration. The electron transport chain creates a proton gradient for ATP synthesis.`,
    
    cellBiology: `The nucleus contains the cell's genetic material. Ribosomes are responsible for protein synthesis through translation. The endoplasmic reticulum processes and modifies proteins. Cell division occurs through mitosis in somatic cells and meiosis in gametes. Signal transduction pathways allow cells to respond to environmental changes.`,
    
    biochemistry: `DNA replication ensures genetic information is accurately passed to daughter cells. RNA polymerase transcribes DNA into RNA. Hemoglobin transports oxygen in red blood cells. Insulin regulates glucose metabolism. Competitive inhibition occurs when inhibitors compete with substrates for the enzyme's active site.`
  };

  // Handle text input change
  const handleTextChange = useCallback((text: string) => {
    setInputText(text);
    setError(null);
    setOutput(null);
  }, []);

  // Load sample text
  const loadSampleText = useCallback((sampleKey: keyof typeof sampleTexts) => {
    const text = sampleTexts[sampleKey];
    setInputText(text);
    setError(null);
    setOutput(null);
  }, []);

  // Handle file upload (text files only for now)
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploadStatus("processing");

    try {
      if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
        const text = await file.text();
        setInputText(text);
        setUploadStatus("done");
      } else {
        throw new Error("Please upload a .txt file for now. PDF support coming soon!");
      }
    } catch (err) {
      console.error("File processing error:", err);
      setError(err instanceof Error ? err.message : "Failed to process file");
      setUploadStatus("error");
    }
  }, []);

  // Parse the text
  const parseText = useCallback(() => {
    if (!enabled) {
      setError("Please enable the biomedical parser first");
      return;
    }
    
    if (!inputText.trim()) {
      setError("Please enter some text or load a sample to analyze");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Simulate processing time for UX
      setTimeout(() => {
        const parsed = improveBiomedicalParsing(inputText);
        setOutput(parsed);
        setLoading(false);
        
        // Smooth scroll to output
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
      case "processing": return "bg-yellow-100 text-yellow-800";
      case "done": return "bg-green-100 text-green-800";
      case "error": return "bg-red-100 text-red-800";
      default: return "";
    }
  };

  const getStatusMessage = (status: UploadStatus) => {
    switch (status) {
      case "processing": return "⚙️ Processing file...";
      case "done": return "✅ File loaded successfully!";
      case "error": return "❌ Upload failed";
      default: return "";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">🧠 Biomedical Text Parser</h1>
          <p className="text-gray-600">Advanced enzyme and biochemistry term analysis</p>
          <p className="text-sm text-gray-500 mt-1">Perfect for analyzing textbooks like Pelley's Biochemistry</p>
        </div>

        {/* Controls Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-3">
              <Label htmlFor="toggleParser" className="text-lg font-medium">
                🔬 Biomedical Parser
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
                </span>
              )}
            </div>
          </div>

          {/* Sample Text Buttons */}
          <div className="mb-6">
            <Label className="block text-sm font-medium mb-3">🧪 Try Sample Texts:</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Button
                onClick={() => loadSampleText('enzymes')}
                variant="outline"
                size="sm"
                className="text-left"
              >
                🧬 Enzymes
              </Button>
              <Button
                onClick={() => loadSampleText('metabolism')}
                variant="outline"
                size="sm"
                className="text-left"
              >
                ⚡ Metabolism
              </Button>
              <Button
                onClick={() => loadSampleText('cellBiology')}
                variant="outline"
                size="sm"
                className="text-left"
              >
                🧫 Cell Biology
              </Button>
              <Button
                onClick={() => loadSampleText('biochemistry')}
                variant="outline"
                size="sm"
                className="text-left"
              >
                🔬 Biochemistry
              </Button>
            </div>
          </div>

          {/* File Upload */}
          <div className="mb-6">
            <Label className="block text-sm font-medium mb-2">
              📄 Upload Text File (PDF support coming soon)
            </Label>
            <input
              type="file"
              accept=".txt"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
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
                Analyzing biomedical content...
              </span>
            ) : (
              "🔬 Analyze Biomedical Text"
            )}
          </Button>
        </div>

        {/* Content Display */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Text */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h2 className="font-semibold text-lg mb-4 flex items-center">
              📝 Input Text
            </h2>
            
            <div className="mb-4">
              <Label className="block text-sm font-medium mb-2">
                Enter or paste your biochemistry text:
              </Label>
              <textarea
                value={inputText}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="Paste biochemistry text here, or use the sample buttons above..."
                className="w-full h-96 p-4 border border-gray-300 rounded-lg text-sm leading-relaxed resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <div className="text-xs text-gray-500">
              💡 Try pasting content from biochemistry textbooks, research papers, or lecture notes
            </div>
          </div>

          {/* Parser Output */}
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold text-lg">🧠 Biomedical Analysis</h2>
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
                  <div className="text-4xl mb-4">🔬</div>
                  <p className="text-lg font-medium">Analysis results will appear here</p>
                  <p className="text-sm mt-2">
                    Enter text and click "Analyze" to see biomedical terms highlighted
                  </p>
                  <div className="mt-6 text-xs text-gray-400 space-y-1">
                    <div>🧬 Enzymes will be highlighted in blue</div>
                    <div>⚡ Processes will be highlighted in green</div>
                    <div>🔗 Pathways will be highlighted in purple</div>
                    <div>🧪 Molecules will be highlighted in red</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>🎯 Focus: Perfect the biomedical parser | 📚 Next: Add PDF support</p>
        </div>
      </div>
    </div>
  );
}