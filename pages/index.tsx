import { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { parseBookWithChapters } from "@/lib/parser";
import { useTheme } from "next-themes";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function Home() {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [zoom, setZoom] = useState(1.5);
  const [mode, setMode] = useState("original");
  const [parsedData, setParsedData] = useState({
    chapters: [] as { title: string; page: number }[],
    thoughtUnits: [] as string[],
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const { theme, setTheme } = useTheme();
  const [showRightBrainModal, setShowRightBrainModal] = useState(false);

  const goToPage = () => {
    const input = document.getElementById("pageNumber") as HTMLInputElement;
    const targetPage = parseInt(input.value);
    if (!isNaN(targetPage) && targetPage >= 1 && targetPage <= (numPages ?? 1)) {
      setPageNumber(targetPage);
    }
  };

  const toggleDarkMode = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    setPageNumber(1);

    if (selectedFile) {
      const parsed = await parseBookWithChapters(selectedFile);
      setParsedData({
        chapters: parsed.chapters || [],
        thoughtUnits: parsed.parsedUnits || [],
      });
    }
  };

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setPageNumber((p) => Math.min((numPages ?? p), p + 1));
      if (e.key === "ArrowLeft") setPageNumber((p) => Math.max(1, p - 1));
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [numPages]);

  return (
    <div className="flex h-screen text-sm">
      <div className="w-64 bg-background p-4 border-r border-border space-y-4 overflow-y-auto">
        <div className="text-xl font-bold flex items-center gap-2">
          <span>🧠</span> Thought-Unit Reader
        </div>
        <div className="text-xs italic text-muted-foreground -mt-2">Read deeper, faster, smarter</div>

        <div>
          <Label htmlFor="upload">Upload a File</Label>
          <input
            id="upload"
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            className="mt-2"
          />
        </div>

        <div>
          <Label>Reading Mode</Label>
          <select
            className="mt-2 w-full border px-2 py-1 rounded"
            value={mode}
            onChange={(e) => {
              const selected = e.target.value;
              if (selected === "right-brain") setShowRightBrainModal(true);
              setMode(selected);
            }}
          >
            <option value="original">Original</option>
            <option value="hybrid">Hybrid</option>
            <option value="right-brain">Right Brain (Coming Soon)</option>
          </select>
        </div>

        {parsedData.chapters.length > 0 && (
          <div>
            <Label>Table of Contents</Label>
            <ScrollArea className="mt-2 h-48 pr-2 text-xs">
              <ul className="space-y-1">
                {parsedData.chapters.map((chapter, idx) => (
                  <li key={idx}>
                    <button
                      className="text-blue-600 hover:underline w-full text-left"
                      onClick={() => setPageNumber(chapter.page)}
                    >
                      {chapter.title}
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}

        <Button
          onClick={toggleDarkMode}
          variant="outline"
          className="w-full flex gap-2 items-center mt-2"
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />} Toggle {theme === "dark" ? "Light" : "Dark"} Mode
        </Button>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        {file ? (
          mode === "original" ? (
            <>
              <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                <div className="text-muted-foreground text-xs">
                  Page {pageNumber} / {numPages}
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-xs">Zoom {Math.round(zoom * 100)}%</span>
                  <Button size="sm" onClick={() => setZoom((z) => Math.min(z + 0.1, 2))}>+</Button>
                  <Button size="sm" onClick={() => setZoom((z) => Math.max(z - 0.1, 0.5))}>-</Button>
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    id="pageNumber"
                    type="number"
                    className="border px-2 py-1 w-20 text-xs"
                    placeholder="Page #"
                    defaultValue={pageNumber}
                  />
                  <Button size="sm" onClick={goToPage}>Go</Button>
                </div>
              </div>
              <Document file={file} onLoadSuccess={onDocumentLoadSuccess} loading={<div className="text-center mt-40">Loading PDF...</div>}>
                <Page pageNumber={pageNumber} scale={zoom} />
              </Document>
            </>
          ) : mode === "hybrid" ? (
            <div className="max-w-xl mx-auto space-y-4">
              <div className="border rounded p-4 shadow">
                <div className="font-semibold text-sm text-blue-500">⚡ Hybrid Reading Controls</div>
                <div className="grid grid-cols-6 gap-2 text-xs text-center mt-2">
                  <Button size="sm">▶ Start</Button>
                  <Button size="sm" variant="secondary">⟳ Reset</Button>
                  <Button size="sm" variant="default">⚙ Settings</Button>
                  <div className="text-blue-500"><strong>0%</strong><br />Complete</div>
                  <div className="text-green-600"><strong>1</strong><br />Current</div>
                  <div className="text-purple-500"><strong>200</strong><br />WPM</div>
                  <div className="text-orange-400"><strong>11357s</strong><br />Left</div>
                </div>
              </div>
              <div className="text-center mt-6 text-gray-700 text-sm">Thought Unit 1 of {parsedData.thoughtUnits.length}</div>
              <div className="text-3xl font-semibold">
                <span className="bg-yellow-300 px-2 py-1 rounded shadow">About</span>
                <span> the pagination of this</span>
              </div>
              <div className="text-xs text-center text-muted-foreground mt-2">Word 1 of 5</div>
              <div className="relative h-2 bg-gray-200 rounded mt-4">
                <div className="absolute top-0 left-0 h-full bg-yellow-400 rounded" style={{ width: '10%' }}></div>
              </div>
            </div>
          ) : null
        ) : (
          <div className="text-center text-muted-foreground mt-20">
            Upload a PDF file to begin reading.
          </div>
        )}
      </div>

      <Dialog open={showRightBrainModal} onOpenChange={setShowRightBrainModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Right Brain View</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This feature is currently in development and will be available in a future update.
          </p>
          <DialogFooter>
            <Button onClick={() => setShowRightBrainModal(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}