// components/HybridReader.tsx
import React, { useState, useEffect, useMemo } from "react";
import { FileText, Image, Play, Volume2, Eye, Grid, List, Download, Search, Filter, Calendar, User, Hash, X } from "lucide-react";
import SimplePDFViewer from "./SimplePDFViewer";

// Simple inline loader component
const Loader: React.FC<{ label?: string }> = ({ label = "Loading..." }) => (
  <div className="flex flex-col items-center justify-center p-8">
    <div className="w-8 h-8 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
    <p className="mt-3 text-sm text-gray-600 font-medium">{label}</p>
  </div>
);

export interface FileData {
  name: string;
  size: number;
  type: string;
  content?: string;
  lastModified?: number;
  path?: string;
  url?: string;
}

interface HybridReaderProps {
  files: FileData[];
  onFileSelect?: (file: FileData) => void;
  className?: string;
  defaultView?: "list" | "grid" | "hybrid";
  showSearch?: boolean;
  showFilters?: boolean;
}

const HybridReader: React.FC<HybridReaderProps> = ({
  files,
  onFileSelect,
  className = "",
  defaultView = "hybrid",
  showSearch = true,
  showFilters = true
}) => {
  const [selectedFile, setSelectedFile] = useState<FileData | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "grid" | "hybrid">(defaultView);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "size" | "date" | "type">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // File processing and URL generation
  const [fileURLs, setFileURLs] = useState<Record<string, string>>({});
  const [pdfURL, setPdfURL] = useState<string | null>(null);

  // Generate object URLs for files
  useEffect(() => {
    const urls: Record<string, string> = {};
    files.forEach(file => {
      if (file.content && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
        try {
          // Convert base64 content to blob URL
          const byteCharacters = atob(file.content.split(',')[1] || file.content);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: file.type });
          urls[file.name] = URL.createObjectURL(blob);
        } catch (error) {
          console.warn(`Failed to create URL for ${file.name}:`, error);
        }
      } else if (file.url) {
        urls[file.name] = file.url;
      }
    });
    setFileURLs(urls);

    // Cleanup URLs on unmount
    return () => {
      Object.values(urls).forEach(url => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [files]);

  // Update PDF URL when selected file changes
  useEffect(() => {
    if (selectedFile?.type === 'application/pdf') {
      setPdfURL(fileURLs[selectedFile.name] || null);
    } else {
      setPdfURL(null);
    }
  }, [selectedFile, fileURLs]);

  // Get unique file types for filter options
  const fileTypes = useMemo(() => {
    const types = new Set(files.map(file => {
      const type = file.type || 'unknown';
      if (type.startsWith('image/')) return 'image';
      if (type.startsWith('video/')) return 'video';
      if (type.startsWith('audio/')) return 'audio';
      if (type.includes('pdf')) return 'pdf';
      if (type.includes('text') || type.includes('json') || type.includes('csv')) return 'text';
      if (type.includes('zip') || type.includes('archive')) return 'archive';
      return 'document';
    }));
    return Array.from(types).sort();
  }, [files]);

  // Filter and sort files
  const filteredAndSortedFiles = useMemo(() => {
    let filtered = files.filter(file => {
      const matchesSearch = file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (file.content && file.content.toLowerCase().includes(searchTerm.toLowerCase()));
      
      if (selectedFilter === "all") return matchesSearch;
      
      const fileCategory = (() => {
        const type = file.type || 'unknown';
        if (type.startsWith('image/')) return 'image';
        if (type.startsWith('video/')) return 'video';
        if (type.startsWith('audio/')) return 'audio';
        if (type.includes('pdf')) return 'pdf';
        if (type.includes('text') || type.includes('json') || type.includes('csv')) return 'text';
        if (type.includes('zip') || type.includes('archive')) return 'archive';
        return 'document';
      })();
      
      return matchesSearch && fileCategory === selectedFilter;
    });

    // Sort files
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "size":
          comparison = a.size - b.size;
          break;
        case "date":
          comparison = (a.lastModified || 0) - (b.lastModified || 0);
          break;
        case "type":
          comparison = (a.type || '').localeCompare(b.type || '');
          break;
      }
      
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [files, searchTerm, selectedFilter, sortBy, sortOrder]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFileIcon = (file: FileData) => {
    const type = file.type || '';
    if (type.startsWith('image/')) return <Image className="w-4 h-4" />;
    if (type.startsWith('video/')) return <Play className="w-4 h-4" />;
    if (type.startsWith('audio/')) return <Volume2 className="w-4 h-4" />;
    if (type.includes('pdf')) return <FileText className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  const getFileExtension = (filename: string): string => {
    return filename.split('.').pop()?.toLowerCase() || '';
  };

  const handleFileClick = (file: FileData) => {
    setSelectedFile(file);
    onFileSelect?.(file);
  };

  const handleDownload = (file: FileData, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (fileURLs[file.name]) {
      const link = document.createElement('a');
      link.href = fileURLs[file.name];
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (file.content) {
      // Download from content
      const link = document.createElement('a');
      link.href = file.content.startsWith('data:') ? file.content : `data:${file.type};base64,${file.content}`;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const renderFilePreview = (file: FileData) => {
    const extension = getFileExtension(file.name);
    const fileUrl = fileURLs[file.name];

    if (file.type.startsWith('image/') && fileUrl) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-gray-50">
          <img 
            src={fileUrl} 
            alt={file.name}
            className="max-w-full max-h-full object-contain"
            loading="lazy"
          />
        </div>
      );
    }

    if (file.type === 'application/pdf' && fileUrl) {
      return <SimplePDFViewer fileUrl={fileUrl} initialScale={1.0} />;
    }

    if (file.type.startsWith('video/') && fileUrl) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-black">
          <video 
            src={fileUrl} 
            controls 
            className="max-w-full max-h-full"
            preload="metadata"
          >
            Your browser does not support the video tag.
          </video>
        </div>
      );
    }

    if (file.type.startsWith('audio/') && fileUrl) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <Volume2 className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <audio src={fileUrl} controls className="mb-4">
              Your browser does not support the audio tag.
            </audio>
            <p className="text-sm text-gray-600">{file.name}</p>
          </div>
        </div>
      );
    }

    if (file.content && (file.type.includes('text') || file.type.includes('json') || extension === 'csv' || extension === 'txt')) {
      const content = file.content.startsWith('data:') 
        ? atob(file.content.split(',')[1]) 
        : file.content;
      
      return (
        <div className="w-full h-full overflow-auto p-4 bg-white">
          <pre className="whitespace-pre-wrap text-sm font-mono">{content}</pre>
        </div>
      );
    }

    // Default preview for unsupported types
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          {getFileIcon(file)}
          <p className="mt-2 text-sm text-gray-600">Preview not available</p>
          <p className="text-xs text-gray-400">{file.type}</p>
        </div>
      </div>
    );
  };

  const renderFileList = () => (
    <div className="space-y-2">
      {filteredAndSortedFiles.map((file, index) => (
        <div
          key={`${file.name}-${index}`}
          className={`p-3 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
            selectedFile?.name === file.name ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
          }`}
          onClick={() => handleFileClick(file)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <div className="flex-shrink-0">
                {getFileIcon(file)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                <div className="flex items-center space-x-4 text-xs text-gray-500">
                  <span>{formatFileSize(file.size)}</span>
                  <span>{file.type}</span>
                  {file.lastModified && (
                    <span className="flex items-center">
                      <Calendar className="w-3 h-3 mr-1" />
                      {formatDate(file.lastModified)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={(e) => handleDownload(file, e)}
              className="p-1 hover:bg-gray-100 rounded"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  const renderFileGrid = () => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {filteredAndSortedFiles.map((file, index) => (
        <div
          key={`${file.name}-${index}`}
          className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
            selectedFile?.name === file.name ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
          }`}
          onClick={() => handleFileClick(file)}
        >
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-2 flex items-center justify-center bg-gray-100 rounded">
              {getFileIcon(file)}
            </div>
            <p className="text-sm font-medium text-gray-900 truncate" title={file.name}>
              {file.name}
            </p>
            <p className="text-xs text-gray-500 mt-1">{formatFileSize(file.size)}</p>
            <button
              onClick={(e) => handleDownload(file, e)}
              className="mt-2 p-1 hover:bg-gray-100 rounded"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  const renderHybridView = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
      {/* File List Panel */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Files</h3>
        <div className="max-h-96 overflow-y-auto">
          {renderFileList()}
        </div>
      </div>

      {/* Preview Panel */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Preview</h3>
          {selectedFile && (
            <button
              onClick={() => setSelectedFile(null)}
              className="p-1 hover:bg-gray-100 rounded"
              title="Close Preview"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        
        <div className="border rounded-lg h-96 overflow-hidden">
          {selectedFile ? (
            <div className="w-full h-full">
              {renderFilePreview(selectedFile)}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Eye className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>Select a file to preview</p>
              </div>
            </div>
          )}
        </div>
        
        {selectedFile && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">{selectedFile.name}</h4>
            <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
              <div>
                <span className="font-medium">Size:</span> {formatFileSize(selectedFile.size)}
              </div>
              <div>
                <span className="font-medium">Type:</span> {selectedFile.type}
              </div>
              {selectedFile.lastModified && (
                <div className="col-span-2">
                  <span className="font-medium">Modified:</span> {formatDate(selectedFile.lastModified)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderView = () => {
    if (loading) return <Loader label="Loading files..." />;
    if (error) return <div className="text-red-600 p-4">{error}</div>;
    if (filteredAndSortedFiles.length === 0) {
      return (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">
            {searchTerm || selectedFilter !== "all" ? "No files match your criteria" : "No files to display"}
          </p>
        </div>
      );
    }

    switch (viewMode) {
      case "list": return renderFileList();
      case "grid": return renderFileGrid();
      case "hybrid": return renderHybridView();
      default: return renderFileList();
    }
  };

  return (
    <div className={`w-full h-full bg-white ${className}`}>
      {/* Header */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex flex-col space-y-4">
          {/* Title and Stats */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">File Reader</h2>
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <span className="flex items-center">
                <Hash className="w-4 h-4 mr-1" />
                {filteredAndSortedFiles.length} files
              </span>
              <span>
                {formatFileSize(files.reduce((total, file) => total + file.size, 0))} total
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0">
            {/* Search and Filters */}
            {showSearch && (
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search files..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                {showFilters && (
                  <div className="flex items-center space-x-2">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <select
                      value={selectedFilter}
                      onChange={(e) => setSelectedFilter(e.target.value)}
                      className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="all">All Types</option>
                      {fileTypes.map(type => (
                        <option key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* View Controls and Sorting */}
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1 border border-gray-300 rounded-md">
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-2 ${viewMode === "list" ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                  title="List View"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-2 ${viewMode === "grid" ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                  title="Grid View"
                >
                  <Grid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("hybrid")}
                  className={`p-2 ${viewMode === "hybrid" ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                  title="Hybrid View"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>

              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [newSortBy, newSortOrder] = e.target.value.split('-') as [typeof sortBy, typeof sortOrder];
                  setSortBy(newSortBy);
                  setSortOrder(newSortOrder);
                }}
                className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="name-asc">Name A-Z</option>
                <option value="name-desc">Name Z-A</option>
                <option value="size-asc">Size ↑</option>
                <option value="size-desc">Size ↓</option>
                <option value="date-desc">Newest</option>
                <option value="date-asc">Oldest</option>
                <option value="type-asc">Type A-Z</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 h-full overflow-auto">
        {renderView()}
      </div>
    </div>
  );
};

export default HybridReader;