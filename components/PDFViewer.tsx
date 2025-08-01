"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Loader from "@/components/ui/loader";

// Import our simplified PDF handler to configure PDF.js
import { configurePdfjs } from "@/lib/pdfjs-handler";

// Define props interface
interface PDFViewerProps {
  fileUrl: string;
  initialScale?: number;
  showControls?: boolean;
}

// Simple implementation that doesn't rely on react-pdf's complicated types
const PDFViewer: React.FC<PDFViewerProps> = ({ 
  fileUrl, 
  initialScale = 1.0, 
  showControls = true 
}) => {
  const [zoom, setZoom] = useState<number>(initialScale);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Set up PDF.js on mount
  useEffect(() => {
    configurePdfjs();
    
    // Set loading state
    if (fileUrl) {
      const img = new Image();
      img.onload = () => setLoading(false);
      img.onerror = () => {
        setError("Failed to load PDF preview");
        setLoading(false);
      };
      // Just to trigger load event - not actually used
      img.src = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
      
      // Simulate loading delay
      setTimeout(() => setLoading(false), 1000);
    }
  }, [fileUrl]);
  
  const changeScale = (delta: number) => {
    setZoom(prevScale => {
      const newScale = prevScale + delta;
      return Math.min(Math.max(0.5, newScale), 3.0);
    });
  };
  
  // Handle error state
  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        {error}
      </div>
    );
  }
  
  // Handle loading state
  if (loading) {
    return <Loader label="Loading PDF..." />;
  }
  
  return (
    <div className="flex flex-col items-center">
      {showControls && (
        <div className="flex flex-wrap gap-2 mb-4 w-full justify-center">
          <Button 
            onClick={() => changeScale(-0.25)} 
            variant="outline"
            size="sm"
          >
            Zoom Out
          </Button>
          
          <span className="px-3 py-2 text-sm">
            {Math.round(zoom * 100)}%
          </span>
          
          <Button 
            onClick={() => changeScale(0.25)} 
            variant="outline"
            size="sm"
          >
            Zoom In
          </Button>
        </div>
      )}
      
      <div className="w-full relative" style={{ 
        height: '70vh', 
        overflow: 'hidden',
        border: '1px solid #ccc',
        borderRadius: '4px'
      }}>
        <iframe 
          src={fileUrl}
          style={{
            width: '100%',
            height: '100%',
            transform: `scale(${zoom})`,
            transformOrigin: 'center top',
            border: 'none'
          }}
          title="PDF Viewer"
        />
      </div>
    </div>
  );
};

export default PDFViewer;