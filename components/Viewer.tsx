// components/Viewer.tsx
import React from "react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import configurePdfjs from '@/lib/pdfjs-config';

// Configure PDF.js worker
configurePdfjs();

// Define the expected props
export interface ViewerProps {
  fileUrl: string;
}

const Viewer: React.FC<ViewerProps> = ({ fileUrl }) => {
  return (
    <div className="flex justify-center">
      <Document file={fileUrl}>
        <Page pageNumber={1} />
      </Document>
    </div>
  );
};

export default Viewer;