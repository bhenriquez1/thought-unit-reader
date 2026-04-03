import React, { useState } from "react";
import { extractPdfPages } from "@/lib/pdfExtract";
import { buildSyllabusToc } from "@/lib/syllabusToc";
import type { TocNode } from "@/lib/readerContracts";
import type { PageTextBundle } from "@/lib/autoToc";

interface SyllabusUploadPanelProps {
  onParsed: (result: {
    fileName: string;
    pages: PageTextBundle[];
    toc: TocNode[];
  }) => void;
}

export default function SyllabusUploadPanel({ onParsed }: SyllabusUploadPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload a PDF syllabus.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setLoading(true);
    setError(null);

    try {
      const pages = await extractPdfPages(objectUrl);
      const toc = buildSyllabusToc(pages);
      onParsed({ fileName: file.name, pages, toc });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse syllabus PDF.");
    } finally {
      setLoading(false);
      URL.revokeObjectURL(objectUrl);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4 text-white">
      <h3 className="text-lg font-semibold">Upload syllabus PDF</h3>
      <p className="mt-1 text-sm text-slate-400">
        We will extract page text, build a TOC, and wire topic jumps into Reader + Study.
      </p>

      <label className="mt-4 block rounded-lg border border-dashed border-indigo-400/60 bg-slate-950 p-4 text-center text-sm hover:bg-slate-900/80">
        <input
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
          disabled={loading}
        />
        {loading ? "Parsing syllabus…" : "Choose syllabus PDF"}
      </label>

      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
    </div>
  );
}
