// pages/index.tsx - Now with:
// ✅ Scroll progress indicator
// ✅ Minimap navigation box
// ✅ All previous features: Syncing, Scroll to Current, Page Search, Zoom

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useTheme } from "next-themes";
import { Document, Page, pdfjs } from "react-pdf";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Tooltip as ReactTooltip } from "react-tooltip";
import { Button } from "../components/ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function Home() {
  const { theme, setTheme } = useTheme();
  const [inputText, setInputText] = useState("");
  const [pdfFile, setPdfFile] = useState<Blob | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfScale, setPdfScale] = useState(1.0);
  const [thoughtUnits, setThoughtUnits] = useState<string[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [unitToPageMap, setUnitToPageMap] = useState<Record<number, number>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const createThoughtUnits = (text: string) => {
    const clean = text.replace(/\s+/g, " ").trim();
    const sents = clean.match(/[^.!?]+[.!?]+/g) || [clean];
    const chunks: string[] = [];
    const maxSize = 6;
    sents.forEach(s => {
      const words = s.split(/\s+/);
      let pack: string[] = [];
      words.forEach((w, i) => {
        pack.push(w);
        if (pack.length >= maxSize || i === words.length - 1) {
          chunks.push(pack.join(" "));
          pack = [];
        }
      });
    });
    setThoughtUnits(chunks);
  };

  const syncToCurrentUnit = () => {
    const page = unitToPageMap[currentChunkIndex];
    document.querySelector(`#page-${page}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleChunkClick = (i: number) => {
    setCurrentChunkIndex(i);
    syncToCurrentUnit();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    setPdfFile(new Blob([buf], { type: file.type }));
    const text = await new Response(buf).text();
    setInputText(text);
    createThoughtUnits(text);
  };

  useEffect(() => {
    if (thoughtUnits.length && numPages) {
      const unitsPerPage = Math.ceil(thoughtUnits.length / numPages);
      const map: Record<number, number> = {};
      thoughtUnits.forEach((_, idx) => {
        map[idx] = Math.floor(idx / unitsPerPage) + 1;
      });
      setUnitToPageMap(map);
    }
  }, [thoughtUnits, numPages]);

  const updateScrollProgress = () => {
    const scroll = pdfContainerRef.current;
    if (!scroll) return;
    const children = Array.from(scroll.querySelectorAll('[id^="page-"]'));
    const top = scroll.scrollTop;
    const visible = children.find((el: any) => el.offsetTop >= top);
    if (visible) {
      const match = visible.id.match(/page-(\d+)/);
      if (match) setCurrentPage(Number(match[1]));
    }
  };

  return (
    <div className={`min-h-screen ${theme === "dark" ? "bg-gray-900 text-white" : "bg-white text-black"}`}>
      <header className="sticky top-0 z-10 flex justify-between p-4 bg-gray-800 text-white">
        <div className="flex gap-2 items-center">
          <input type="file" onChange={handleFileChange} className="bg-gray-100 text-black rounded px-2" />
          <Button onClick={syncToCurrentUnit}>Scroll to Current</Button>
          <input
            type="number"
            placeholder="Page #"
            className="w-20 px-2 py-1 rounded text-black"
            onKeyDown={e => {
              if (e.key === "Enter") {
                const n = Number((e.target as HTMLInputElement).value);
                document.querySelector(`#page-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }}
          />
          <button onClick={() => setPdfScale(s => Math.min(3, s + 0.25))}>Zoom +</button>
          <button onClick={() => setPdfScale(s => Math.max(0.5, s - 0.25))}>Zoom -</button>
          <span className="ml-4">📄 Page {currentPage} of {numPages}</span>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
        <div className="overflow-y-auto border rounded p-4 relative" ref={pdfContainerRef} onScroll={updateScrollProgress}>
          {pdfFile && (
            <TransformWrapper initialScale={pdfScale}>
              <TransformComponent>
                <Document file={pdfFile} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
                  {Array.from({ length: numPages }, (_, i) => (
                    <div id={`page-${i + 1}`} key={i} className="cursor-pointer my-4">
                      <Page pageNumber={i + 1} scale={pdfScale} />
                    </div>
                  ))}
                </Document>
              </TransformComponent>
            </TransformWrapper>
          )}

          {/* MiniMap */}
          <div className="absolute right-2 top-2 w-2 bg-gray-500 rounded-full h-full opacity-20">
            <div
              style={{ height: `${100 / numPages}%`, top: `${((currentPage - 1) / numPages) * 100}%` }}
              className="absolute w-full bg-blue-500 rounded-full opacity-80 transition-all duration-200"
            />
          </div>
        </div>

        <div className="overflow-y-auto border rounded p-4">
          <h2 className="text-lg font-semibold mb-2">Thought Units</h2>
          <div className="space-y-2">
            {thoughtUnits.map((u, i) => (
              <div
                key={i}
                onClick={() => handleChunkClick(i)}
                className={`p-2 rounded transition-all duration-300 cursor-pointer ${i === currentChunkIndex ? "bg-blue-500 text-white scale-105" : "hover:bg-gray-100"}`}
              >
                {u}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}