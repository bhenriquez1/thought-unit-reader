// components/Viewer.tsx

import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

// Point to the correct PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

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