"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "../components/ui/button";
import Loader from "../components/ui/loader";

/**
 * Enhanced PDF Viewer component that works with privacy browsers like CryptoTab
 */
const PDFViewer: React.FC<{
  fileUrl: string;
  initialScale?: number;
  showControls?: boolean;
}> = ({ 
  fileUrl, 
  initialScale = 1.0, 
  showControls = true 
}) => {
  const [zoom, setZoom] = useState<number>(initialScale);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [embedHeight, setEmbedHeight] = useState<string>("70vh");
  
  useEffect(() => {
    // Adjust container size based on window
    const updateDimensions = () => {
      if (containerRef.current) {
        const viewportHeight = window.innerHeight;
        setEmbedHeight(`${Math.floor(viewportHeight * 0.7)}px`);
      }
    };
    
    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    
    // Set up loading state
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1500);
    
    return () => {
      window.removeEventListener("resize", updateDimensions);
      clearTimeout(timer);
    };
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
  
  // Calculate scale percentage
  const scalePercentage = Math.round(zoom * 100);
  
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
            {scalePercentage}%
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
      
      <div 
        ref={containerRef}
        className="w-full relative overflow-hidden rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-900"
        style={{ 
          height: embedHeight
        }}
      >
        {/* Direct PDF embed with object tag instead of iframe */}
        <object
          data={fileUrl}
          type="application/pdf"
          width="100%"
          height="100%"
          className="w-full h-full"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            transition: 'transform 0.2s ease-in-out'
          }}
        >
          <div className="flex flex-col items-center justify-center h-full p-8">
            <p className="text-red-500 mb-4">Unable to display PDF in this browser.</p>
            <a 
              href={fileUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              Download PDF
            </a>
          </div>
        </object>
      </div>
    </div>
  );
};

export default PDFViewer;