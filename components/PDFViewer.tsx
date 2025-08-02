"use client";

import React, { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import Loader from "../components/ui/loader";

// A more reliable PDF viewer component that uses iframe for PDF viewing
const SimplePdfViewer: React.FC<{
  fileUrl: string;
  width?: string;
  height?: string;
}> = ({ 
  fileUrl, 
  width = "100%", 
  height = "100%"
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Simple check if the PDF URL is valid
    if (fileUrl) {
      const checkUrl = async () => {
        try {
          // For blob URLs, we can't really check them with fetch
          if (fileUrl.startsWith('blob:')) {
            setLoading(false);
            return;
          }
          
          const response = await fetch(fileUrl, { method: 'HEAD' });
          if (!response.ok) {
            setError(`Failed to load PDF (Status: ${response.status})`);
          }
          setLoading(false);
        } catch (err) {
          console.error("Error checking PDF URL:", err);
          // Don't set error for blob URLs as they can't be fetched directly
          if (!fileUrl.startsWith('blob:')) {
            setError("Failed to access PDF");
          }
          setLoading(false);
        }
      };
      
      checkUrl();
    }
  }, [fileUrl]);

  if (loading) {
    return <Loader label="Loading PDF..." />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center w-full h-full border rounded bg-red-50 dark:bg-red-900/20 p-4">
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <iframe 
      src={fileUrl}
      width={width}
      height={height}
      className="w-full h-full border-0 rounded"
      style={{ 
        backgroundColor: "#f8f9fa",
      }}
      title="PDF Document"
      sandbox="allow-same-origin allow-scripts"
    />
  );
};

// Define props interface
interface PDFViewerProps {
  fileUrl: string;
  initialScale?: number;
  showControls?: boolean;
}

// Main component using SimplePdfViewer
const PDFViewer: React.FC<PDFViewerProps> = ({ 
  fileUrl, 
  initialScale = 1.0, 
  showControls = true 
}) => {
  const [zoom, setZoom] = useState<number>(initialScale);
  
  const changeScale = (delta: number) => {
    setZoom(prevScale => {
      const newScale = prevScale + delta;
      return Math.min(Math.max(0.5, newScale), 3.0);
    });
  };
  
  return (
    <div className="flex flex-col items-center w-full">
      {showControls && (
        <div className="flex flex-wrap gap-2 mb-4 w-full justify-center">
          <Button 
            onClick={() => changeScale(-0.25)} 
            variant="outline"
            size="sm"
          >
            ➖ Zoom Out
          </Button>
          
          <span className="px-3 py-2 text-sm">
            {Math.round(zoom * 100)}%
          </span>
          
          <Button 
            onClick={() => changeScale(0.25)} 
            variant="outline"
            size="sm"
          >
            ➕ Zoom In
          </Button>
        </div>
      )}
      
      <div className="w-full relative" style={{ 
        height: '70vh', 
        overflow: 'hidden',
        border: '1px solid #ccc',
        borderRadius: '4px',
        transform: `scale(${zoom})`,
        transformOrigin: 'center top',
        transition: 'transform 0.2s ease-in-out'
      }}>
        <SimplePdfViewer 
          fileUrl={fileUrl}
          width="100%"
          height="100%"
        />
      </div>
    </div>
  );
};

export default PDFViewer;