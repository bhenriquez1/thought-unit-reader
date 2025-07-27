// pages/index.tsx
import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Tooltip } from "react-tooltip";
import ReactFlow, { Background, Controls } from "react-flow-renderer";

import { parseBookWithChapters } from "../lib/parser";
import { Button } from "../components/ui/button";

// configure PDF worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function Home() {
  // … all your state, callbacks, chunking & handlers (exactly as before) …

  // compute chapterOffsets if you want to jump directly to unit X for each chapter:
  const chapterOffsets = useMemo(() => {
    if (!bookStructure?.chapters) return [];
    let sum = 0;
    return bookStructure.chapters.map((ch: any) => {
      const start = sum;
      sum += ch.units.length;
      return start;
    });
  }, [bookStructure]);

  // ConceptMap sub-component unchanged…

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ─── Sticky Header ───────────────────────────── */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <input
            type="file"
            accept=".pdf,.txt"
            onChange={handleFileChange}
            className="border rounded p-1"
          />
          <Button onClick={parseText}>Parse Chapters</Button>
          {uploadStatus === "uploading" && <span>⏳ Loading…</span>}
          {uploadStatus === "error"     && (
            <span className="text-red-600">⚠️ {error}</span>
          )}
        </div>
      </header>

      {/* ─── Main Two-Column Grid ─────────────────────── */}
      <main className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT PANEL: Contents + PDF/Text */}
        <section className="bg-white border border-gray-200 rounded-lg shadow flex flex-col">
          {bookStructure?.chapters && (
            <nav className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Contents</h3>
              <ul className="space-y-1">
                {bookStructure.chapters.map((ch: any, i: number) => (
                  <li key={i}>
                    <button
                      onClick={() => handleChunkClick(chapterOffsets[i])}
                      className="w-full text-left text-gray-800 hover:underline"
                    >
                      {ch.title}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <div className="flex-1 overflow-auto">
            {fileType === "pdf" && pdfFile ? (
              <TransformWrapper>
                <TransformComponent>
                  <Document
                    file={pdfFile}
                    onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                    className="w-full"
                  >
                    {Array.from({ length: Math.min(numPages, 50) }).map((_, i) => (
                      <Page
                        key={i}
                        pageNumber={i + 1}
                        scale={1.2}
                        className="mb-6"
                      />
                    ))}
                  </Document>
                </TransformComponent>
              </TransformWrapper>
            ) : (
              <div
                ref={textContainerRef}
                className="p-4 whitespace-pre-wrap overflow-auto h-full"
              >
                {inputText.split(/(\s+)/).map((tok, idx) => {
                  const clean = tok.replace(/[^a-zA-Z]/g, "").toLowerCase();
                  const ui    = thoughtUnits.findIndex(u =>
                    u.toLowerCase().split(/\s+/).includes(clean)
                  );
                  return (
                    <span
                      key={idx}
                      data-tooltip-id="glossary"
                      data-tooltip-content={GLOSSARY[clean] || ""}
                      data-chunk={ui >= 0 ? `unit-${ui}` : undefined}
                      className={
                        ui === currentChunkIndex
                          ? "bg-yellow-200"
                          : "hover:bg-yellow-100"
                      }
                      style={{ cursor: ui >= 0 ? "pointer" : "inherit" }}
                      onClick={ui >= 0 ? (e) => onWordClick(ui, e) : undefined}
                    >
                      {tok}
                    </span>
                  );
                })}
                <Tooltip id="glossary" />
              </div>
            )}
          </div>
        </section>

        {/* RIGHT PANEL: Thought Units + Concept Map */}
        <section
          ref={unitsListRef}
          className="bg-white border border-gray-200 rounded-lg shadow flex flex-col"
        >
          <header className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-800">Thought Units</h2>
          </header>
          <div className="flex-1 overflow-auto p-4 space-y-2">
            {thoughtUnits.map((u, i) => (
              <button
                key={i}
                data-unit={i}
                onClick={() => handleChunkClick(i)}
                className={`w-full text-left p-2 rounded transition ${
                  i === currentChunkIndex
                    ? "bg-blue-100"
                    : "hover:bg-gray-50"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
          {bookStructure?.chapters && (
            <footer className="px-4 py-3 border-t border-gray-100 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Concept Map
              </h3>
              <ConceptMap chapters={bookStructure.chapters} />
            </footer>
          )}
        </section>
      </main>
    </div>
  );
}