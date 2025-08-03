// components/SmartPDFViewer.tsx
import React, { useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';

export interface SmartPDFViewerProps {
  fileUrl: string;
  scale?: number;
  className?: string;
  onWordClick?: (word: string) => void;
  showTextOverlay?: boolean;
  textContent?: string;
  currentPage?: number;
  onPageChange?: (page: number) => void;
}

const fullTableOfContents = [
  { page: 1, title: "Cover & Title Page", level: 0 },
  { page: 3, title: "Table of Contents", level: 0 },
  { page: 15, title: "Chapter 1: Introduction to Molecular Geometry", level: 1 },
  { page: 16, title: "1.1 Basic Concepts", level: 2 },
  { page: 25, title: "1.2 VSEPR Theory", level: 2 },
  { page: 35, title: "1.3 Hybridization", level: 2 },
  { page: 45, title: "1.4 Molecular Shapes", level: 2 },
  { page: 55, title: "1.5 Polarity and Intermolecular Forces", level: 2 },
  { page: 68, title: "1.9 Molecular Geometries", level: 2 },
  { page: 78, title: "Chapter 2: Chemical Bonding", level: 1 },
  { page: 89, title: "2.1 Ionic Bonding", level: 2 },
  { page: 105, title: "2.2 Covalent Bonding", level: 2 },
  { page: 125, title: "2.3 Metallic Bonding", level: 2 },
  { page: 145, title: "2.4 Bond Properties", level: 2 },
  { page: 165, title: "Chapter 3: Thermodynamics", level: 1 },
  { page: 178, title: "3.1 First Law of Thermodynamics", level: 2 },
  { page: 195, title: "3.2 Enthalpy", level: 2 },
  { page: 215, title: "3.3 Entropy", level: 2 },
  { page: 235, title: "3.4 Gibbs Free Energy", level: 2 },
  { page: 255, title: "Chapter 4: Kinetics", level: 1 },
  { page: 275, title: "4.1 Reaction Rates", level: 2 },
  { page: 295, title: "4.2 Rate Laws", level: 2 },
  { page: 315, title: "4.3 Reaction Mechanisms", level: 2 },
  { page: 335, title: "4.4 Catalysis", level: 2 },
  { page: 355, title: "Chapter 5: Equilibrium", level: 1 },
  { page: 375, title: "5.1 Chemical Equilibrium", level: 2 },
  { page: 395, title: "5.2 Le Chatelier's Principle", level: 2 },
  { page: 415, title: "5.3 Acid-Base Equilibria", level: 2 },
  { page: 435, title: "5.4 Solubility Equilibria", level: 2 },
  { page: 455, title: "Appendix A: Mathematical Review", level: 1 },
  { page: 475, title: "Appendix B: Reference Tables", level: 1 },
  { page: 495, title: "Index", level: 1 }
];

const SmartPDFViewer: React.FC<SmartPDFViewerProps> = ({
  fileUrl,
  scale = 1.25,
  className = "",
  onWordClick,
  showTextOverlay = false,
  textContent = "",
  currentPage = 1,
  onPageChange
}) => {
  const [zoom, setZoom] = useState(scale);
  const [showTOC, setShowTOC] = useState(false);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3.0));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const pdfViewerUrl = `${fileUrl}#zoom=${Math.round(zoom * 100)}&view=FitH`;

  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* PDF Controls */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
        <button
          onClick={() => setShowTOC(!showTOC)}
          className="bg-gray-800 bg-opacity-80 text-white px-3 py-2 rounded-lg hover:bg-opacity-90 transition-all flex items-center space-x-2"
        >
          <span>☰</span>
          <span className="hidden sm:inline">Contents</span>
        </button>

        <div className="flex items-center space-x-2 bg-gray-800 bg-opacity-80 rounded-lg p-2">
          <button onClick={handleZoomOut} className="text-white hover:text-gray-300 p-1">
            <ZoomOut size={16} />
          </button>
          <span className="text-white text-sm min-w-[50px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={handleZoomIn} className="text-white hover:text-gray-300 p-1">
            <ZoomIn size={16} />
          </button>
        </div>
      </div>

      {/* TOC */}
      {showTOC && (
        <div className="absolute top-0 left-0 w-80 h-full bg-gray-900 bg-opacity-95 z-30 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Table of Contents</h3>
              <button onClick={() => setShowTOC(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="space-y-2">
              {fullTableOfContents.map((item, index) => (
                <div
                  key={index}
                  className={`cursor-pointer hover:bg-gray-700 p-2 rounded text-sm transition-colors ${
                    item.level === 0 ? 'text-gray-400 italic' :
                    item.level === 1 ? 'text-white font-medium bg-gray-800' :
                    'text-gray-300 ml-4'
                  } ${item.page === currentPage ? 'bg-blue-600 text-white' : ''}`}
                  onClick={() => {
                    onPageChange?.(item.page);
                    setShowTOC(false);
                    console.log(`Navigate to page ${item.page}: ${item.title}`);
                  }}
                >
                  <div className="flex justify-between">
                    <span>{item.title}</span>
                    <span className="text-gray-500">{item.page}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Text Overlay */}
      {showTextOverlay && textContent && (
        <div className="absolute inset-0 z-10 bg-transparent pointer-events-none">
          <div
            className="absolute inset-0 p-8 text-transparent pointer-events-auto"
            style={{ fontSize: '14px', lineHeight: '1.6' }}
          >
            {textContent.split(' ').map((word, i) => (
              <span
                key={i}
                className="hover:bg-yellow-400 hover:bg-opacity-30 cursor-pointer pointer-events-auto"
                onClick={() => onWordClick?.(word)}
                style={{ userSelect: 'none' }}
              >
                {word}{' '}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Iframe PDF */}
      <iframe
        src={pdfViewerUrl}
        className="w-full h-full border-0"
        style={{ minHeight: '70vh' }}
        title="PDF Document"
      />
    </div>
  );
};

export default SmartPDFViewer;