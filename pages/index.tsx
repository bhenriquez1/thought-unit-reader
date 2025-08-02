// pages/index.tsx
import React, { useState, useEffect } from 'react';
import { Upload, FileText, Settings, Info, RotateCcw } from 'lucide-react';

// Import your HybridReader component
// Adjust the import path based on your project structure
import HybridReader from '../components/HybridReader';

// FileData interface (should match your HybridReader component)
export interface FileData {
  name: string;
  size: number;
  type: string;
  content?: string;
  lastModified?: number;
  path?: string;
  url?: string;
}

export default function HomePage() {
  // Core state for the application
  const [files, setFiles] = useState<FileData[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [aiEnabled, setAiEnabled] = useState<boolean>(true);
  const [isDebugMode, setIsDebugMode] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"list" | "grid" | "hybrid">("hybrid");
  const [showUploadArea, setShowUploadArea] = useState<boolean>(true);

  // File upload handler
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const newFiles: FileData[] = [];

      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        
        // Read file content for text files and images
        let content = '';
        if (file.type.startsWith('text/') || 
            file.type.includes('json') || 
            file.type.includes('csv') ||
            file.type.startsWith('image/') ||
            file.type === 'application/pdf') {
          
          content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            
            if (file.type.startsWith('image/') || file.type === 'application/pdf') {
              reader.readAsDataURL(file);
            } else {
              reader.readAsText(file);
            }
          });
        }

        const fileData: FileData = {
          name: file.name,
          size: file.size,
          type: file.type,
          content: content,
          lastModified: file.lastModified,
          path: file.webkitRelativePath || file.name
        };

        newFiles.push(fileData);
      }

      setFiles(prevFiles => [...prevFiles, ...newFiles]);
      setShowUploadArea(false);

    } catch (err) {
      setError(`Failed to process files: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle file selection from HybridReader
  const handleFileSelect = (file: FileData) => {
    setSelectedFile(file);
    console.log('Selected file:', file.name);
  };

  // Clear all files
  const handleClearFiles = () => {
    setFiles([]);
    setSelectedFile(null);
    setShowUploadArea(true);
    setError(null);
  };

  // Toggle functions for UI controls
  const toggleAI = () => setAiEnabled(prev => !prev);
  const toggleDebugMode = () => setIsDebugMode(prev => !prev);
  const toggleViewMode = () => {
    setViewMode(prev => {
      if (prev === "list") return "grid";
      if (prev === "grid") return "hybrid";
      return "list";
    });
  };

  // Sample data for demonstration (remove in production)
  useEffect(() => {
    if (files.length === 0) {
      const sampleFiles: FileData[] = [
        {
          name: "sample-document.txt",
          size: 1024,
          type: "text/plain",
          content: "This is a sample text document.\n\nIt contains multiple lines of text to demonstrate the text viewer functionality.",
          lastModified: Date.now() - 86400000, // 1 day ago
        },
        {
          name: "sample-data.json",
          size: 512,
          type: "application/json",
          content: JSON.stringify({
            name: "Sample Data",
            version: "1.0.0",
            description: "This is sample JSON data",
            features: ["file reading", "preview", "download"]
          }, null, 2),
          lastModified: Date.now() - 3600000, // 1 hour ago
        }
      ];
      
      // Uncomment to load sample data automatically
      // setFiles(sampleFiles);
    }
  }, [files.length]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <FileText className="w-8 h-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">
                Thought Unit Reader
              </h1>
            </div>

            {/* Header Controls */}
            <div className="flex items-center space-x-4">
              <button
                onClick={toggleAI}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  aiEnabled 
                    ? 'bg-green-100 text-green-800 border border-green-300' 
                    : 'bg-gray-100 text-gray-600 border border-gray-300'
                }`}
              >
                AI {aiEnabled ? 'Enabled' : 'Disabled'}
              </button>

              <button
                onClick={toggleDebugMode}
                className={`p-2 rounded-md transition-colors ${
                  isDebugMode 
                    ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title="Toggle Debug Mode"
              >
                <Settings className="w-4 h-4" />
              </button>

              {files.length > 0 && (
                <button
                  onClick={handleClearFiles}
                  className="p-2 rounded-md bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                  title="Clear All Files"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <Info className="w-5 h-5 text-red-600 mr-2" />
              <p className="text-red-800">{error}</p>
              <button
                onClick={() => setError(null)}
                className="ml-auto text-red-600 hover:text-red-800"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Upload Area */}
        {showUploadArea && (
          <div className="mb-8">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Upload Files to Get Started
              </h3>
              <p className="text-gray-600 mb-4">
                Choose files to upload and preview. Supports documents, images, PDFs, and more.
              </p>
              
              <label className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer transition-colors">
                <Upload className="w-4 h-4 mr-2" />
                Choose Files
                <input
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  accept=".txt,.json,.csv,.pdf,.jpg,.jpeg,.png,.gif,.mp4,.mp3,.zip"
                />
              </label>
              
              <p className="text-xs text-gray-500 mt-2">
                Or drag and drop files here
              </p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Processing files...</p>
          </div>
        )}

        {/* File Reader Component */}
        {files.length > 0 && !isLoading && (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <HybridReader
              files={files}
              onFileSelect={handleFileSelect}
              defaultView={viewMode}
              showSearch={true}
              showFilters={true}
              className="h-[80vh]"
            />
          </div>
        )}

        {/* Empty State */}
        {files.length === 0 && !isLoading && !showUploadArea && (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Files Loaded</h3>
            <p className="text-gray-600 mb-4">Upload some files to get started.</p>
            <button
              onClick={() => setShowUploadArea(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Upload Files
            </button>
          </div>
        )}

        {/* Debug Info */}
        {isDebugMode && (
          <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 className="font-medium text-yellow-800 mb-2">Debug Information</h4>
            <div className="text-sm text-yellow-700 space-y-1">
              <p>Files loaded: {files.length}</p>
              <p>Selected file: {selectedFile?.name || 'None'}</p>
              <p>View mode: {viewMode}</p>
              <p>AI enabled: {aiEnabled ? 'Yes' : 'No'}</p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center text-sm text-gray-500">
            <p>Thought Unit Reader - Advanced File Processing and Analysis</p>
          </div>
        </div>
      </footer>
    </div>
  );
}