// components/PDFViewer.js
import { useRef, useEffect, useState } from 'react';
import { pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function PDFViewer({ file }) {
  const canvasRef = useRef();
  const [pageCount, setPageCount] = useState(null);
  const [pageNum, setPageNum] = useState(1);

  useEffect(() => {
    if (!file) return;
    const loadPDF = async () => {
      const loadingTask = pdfjs.getDocument(file);
      const pdf = await loadingTask.promise;
      setPageCount(pdf.numPages);

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport }).promise;
    };
    loadPDF();
  }, [file, pageNum]);

  return (
    <div className="flex flex-col items-center">
      <canvas ref={canvasRef} className="border rounded" />
      {pageCount && (
        <div className="flex justify-between mt-2 w-full">
          <button onClick={() => setPageNum((p) => Math.max(1, p - 1))} disabled={pageNum === 1}>
            ◀ Prev
          </button>
          <span>
            Page {pageNum} of {pageCount}
          </span>
          <button onClick={() => setPageNum((p) => Math.min(pageCount, p + 1))} disabled={pageNum === pageCount}>
            Next ▶
          </button>
        </div>
      )}
    </div>
  );
}
