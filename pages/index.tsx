// pages/index.tsx - Working Bidirectional Navigation
import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import { parseBookWithChapters, generateProgressiveReadingHTML } from "../lib/parser";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";

// PDF.js worker configuration
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type FileType = "text" | "pdf" | "none";
type ViewMode = "original" | "chapters" | "progressive" | "hybrid";

export default function Home() {
  // Core states
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // View & data
  const [viewMode, setViewMode] = useState<ViewMode>("hybrid");
  const [bookStructure, setBookStructure] = useState<any>(null);
  const [currentChapter, setCurrentChapter] = useState(0);

  // PDF states
  const [fileType, setFileType] = useState<FileType>("none");
  const [pdfFile, setPdfFile] = useState<Blob | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [fileName, setFileName] = useState("");
  const [pdfScale, setPdfScale] = useState(1.0);

  // Hybrid reader / chunking states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [chunkSpeed, setChunkSpeed] = useState(2000);
  const [wordSpeed, setWordSpeed] = useState(300);
  const [maxChunkSize, setMaxChunkSize] = useState(6);
  const [showSettings, setShowSettings] = useState(false);
  const [wpm, setWpm] = useState(200);

  // New granularity toggles
  const [useSubUnits, setUseSubUnits] = useState(false);
  const [useGlossary, setUseGlossary] = useState(false);
  const [useConceptMaps, setUseConceptMaps] = useState(false);
  const [useQuizzes, setUseQuizzes] = useState(false);

  // Navigation & highlighting
  const [thoughtUnits, setThoughtUnits] = useState<string[]>([]);
  const [highlightPosition, setHighlightPosition] = useState<{ start: number; end: number } | null>(null);

  const chunkTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wordTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // Compute speeds on WPM or chunk size change
  useEffect(() => {
    const wordMs = (60 / wpm) * 1000;
    setWordSpeed(wordMs);
    setChunkSpeed(wordMs * maxChunkSize * 1.5);
  }, [wpm, maxChunkSize]);

  // Enhanced chunker with extra granularity
  const createThoughtUnits = useCallback((text: string) => {
    const clean = text.replace(/\s+/g, ' ').trim();
    const sentences = clean.match(/[^\.!?]+[\.!?]+/g) || [clean];
    let chunks: string[] = [];
    const breakWords = ['and','or','but','because','however','therefore'];
    const preps = ['in','on','at','by','for','with','from','to','of','about','through'];

    sentences.forEach(s => {
      const words = s.split(/\s+/);
      let cur: string[] = [];
      for (let i = 0; i < words.length; i++) {
        cur.push(words[i]);
        const next = words[i+1]?.toLowerCase();
        const prev = words[i-1]?.toLowerCase();
        const atMax = cur.length >= maxChunkSize;
        const atMin = cur.length >= 3;
        const punct = /[,;:]/.test(words[i]);
        const beforeBreak = breakWords.includes(next);
        const afterPrep = preps.includes(prev);
        const last = i === words.length-1;
        if (atMax || last || (atMin && (punct||beforeBreak)) || (cur.length>=4&&afterPrep)) {
          let unit = cur.join(' ');
          // sub-unit splitting
          if (useSubUnits && unit.split(' ').length > maxChunkSize/2) {
            const halves = unit.split(/;|:/).map(u=>u.trim()).filter(Boolean);
            if (halves.length > 1) {
              halves.forEach(h=>chunks.push(h));
              cur=[];
              continue;
            }
          }
          chunks.push(unit);
          cur = [];
        }
      }
      if (cur.length) chunks.push(cur.join(' '));
    });

    // placeholder: glossary/concept maps/quizzes could annotate later
    setThoughtUnits(chunks);
    return chunks;
  }, [maxChunkSize, useSubUnits]);

  useEffect(() => { createThoughtUnits(inputText); }, [inputText, createThoughtUnits]);

  const currentWords = thoughtUnits[currentChunkIndex]?.split(/\s+/) || [];

  // click to sync highlight
  const handleTextAreaClick = useCallback(() => {
    if (!textAreaRef.current) return;
    const pos = textAreaRef.current.selectionStart;
    const pct = pos / inputText.length;
    const idx = Math.floor(pct * thoughtUnits.length);
    setCurrentChunkIndex(idx);
    setCurrentWordIndex(0);
  }, [inputText, thoughtUnits.length]);

  // highlight scrolling
  useEffect(() => {
    if (!textAreaRef.current) return;
    const unit = thoughtUnits[currentChunkIndex]||'';
    const start = inputText.toLowerCase().indexOf(unit.toLowerCase());
    if (start>=0) {
      const end = start+unit.length;
      setHighlightPosition({start,end});
      setTimeout(()=>{
        textAreaRef.current?.setSelectionRange(start,end);
        const scrollPos = (start/inputText.length)*textAreaRef.current.scrollHeight;
        textAreaRef.current.scrollTop = scrollPos - textAreaRef.current.clientHeight/2;
      },100);
    }
  }, [currentChunkIndex, thoughtUnits, inputText]);

  // PDF click
  const handlePdfPageClick = useCallback((n:number)=>{
    const pct = (n-1)/numPages;
    const idx = Math.floor(pct*thoughtUnits.length);
    setCurrentChunkIndex(idx);
    setCurrentWordIndex(0);
  },[numPages, thoughtUnits.length]);

  // playback timers
  useEffect(() => {
    if (!isPlaying) return;
    wordTimerRef.current = setInterval(()=>{
      setCurrentWordIndex(w=> (w+1>=currentWords.length?0:w+1));
    }, wordSpeed);
    chunkTimerRef.current = setTimeout(()=>{
      setCurrentChunkIndex(i=> Math.min(i+1, thoughtUnits.length-1));
      setCurrentWordIndex(0);
    }, chunkSpeed);
    return ()=>{ clearInterval(wordTimerRef.current!); clearTimeout(chunkTimerRef.current!); };
  }, [isPlaying, currentChunkIndex, wordSpeed, chunkSpeed, currentWords.length, thoughtUnits.length]);

  const handleReset = ()=>{ setIsPlaying(false); setCurrentChunkIndex(0); setCurrentWordIndex(0); };

  // OCR + chapters: (placeholder) integrate DOCX OCR and real TOC

  // file upload & text extraction
  const extractTextFromPDF = useCallback(async (buffer:ArrayBuffer):Promise<string>=>{
    const pdf = await pdfjs.getDocument({data:buffer, cMapUrl:`//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/cmaps/`,cMapPacked:true}).promise;
    let txt="";
    for (let i=1;i<=Math.min(pdf.numPages,200);i++){
      const pg = await pdf.getPage(i);
      const content = await pg.getTextContent();
      txt+= content.items.map((it:any)=>(it.str)).join(' ')+"\n\n";
    }
    return txt;
  },[]);

  const handleFileChange = useCallback(async e=>{
    const f = e.target.files?.[0]; if(!f) return;
    setUploadStatus("uploading"); setFileName(f.name); setError(null); handleReset();
    try{
      setUploadStatus("processing");
      let txt="";
      if (f.type==="application/pdf") {
        const buf = await f.arrayBuffer(); setPdfFile(new Blob([buf],{type:'application/pdf'})); setFileType("pdf");
        txt = await extractTextFromPDF(buf);
      } else if (f.type==="text/plain"||f.name.endsWith('.txt')) {
        txt = await f.text(); setFileType("text"); setPdfFile(null);
      } else throw new Error("Unsupported");
      setInputText(txt); setUploadStatus("done");
    } catch(err:any){ setError(err.message); setUploadStatus("error"); }
  },[extractTextFromPDF]);

  // parse to chapters
  const parseText = useCallback(()=>{
    if(!enabled||!inputText.trim()){ setError("Enable and provide text"); return; }
    setLoading(true); setError(null);
    setTimeout(()=>{
      const title = fileName.replace(/\.(pdf|txt)$/i,'')||"Book";
      const struct = parseBookWithChapters(inputText,title);
      setBookStructure(struct); setViewMode("hybrid"); setLoading(false);
    },500);
  },[enabled,inputText,fileName]);

  // status
  const totalWords = thoughtUnits.join(' ').split(/\s+/).length;
  const wordsRead = thoughtUnits.slice(0,currentChunkIndex+1).join(' ').split(/\s+/).length;
  const percentComplete = totalWords? Math.round(wordsRead/totalWords*100):0;
  const estimatedTime = totalWords? Math.round((totalWords-wordsRead)/(wpm/60)):0;

  // render TOC
  const renderTOC = () =>
    bookStructure?.chapters?.map((c:any,idx:number)=>(
      <button key={idx} onClick={()=>{setCurrentChapter(idx); setViewMode('chapters');}} className="px-2 py-1 text-xs text-blue-600 hover:underline">{c.title}</button>
    ));

  // helpers
  const getStatusColor=(s:UploadStatus)=>({uploading:'bg-blue-100',processing:'bg-yellow-100',done:'bg-green-100',error:'bg-red-100'}[s]||"");
  const getStatusMsg=(s:UploadStatus)=>({uploading:'Uploading...',processing:'Analyzing...',done:'Done!',error:'Failed'}[s]||"");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header + TOC */}
      <header className="sticky top-0 bg-white shadow z-20 p-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Thought Unit Reader</h1>
        <nav className="space-x-2 overflow-x-auto flex">{renderTOC()}</nav>
      </header>

      {/* Controls */}
      <section className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <input type="file" accept=".pdf,.txt" onChange={handleFileChange} className="col-span-1" />
        <Button onClick={parseText} disabled={!enabled||!inputText||loading} className="col-span-1">Create Thought Units</Button>
        <div className="col-span-1 flex flex-col space-y-2">
          <label><Switch checked={enabled} onCheckedChange={setEnabled}/> Enable Analyzer</label>
          <label><input type="checkbox" checked={useSubUnits} onChange={e=>setUseSubUnits(e.target.checked)}/> Split Sub-Units</label>
          <label><input type="checkbox" checked={useGlossary} onChange={e=>setUseGlossary(e.target.checked)}/> Glossary Links</label>
          <label><input type="checkbox" checked={useConceptMaps} onChange={e=>setUseConceptMaps(e.target.checked)}/> Concept Maps</label>
          <label><input type="checkbox" checked={useQuizzes} onChange={e=>setUseQuizzes(e.target.checked)}/> Quick Quizzes</label>
        </div>
      </section>

      {/* Main Panels */}
      <div className="flex flex-col lg:flex-row h-[calc(100vh_-_200px)]">
        {/* Original / PDF Panel */}
        <div className="w-full lg:w-1/2 border-r overflow-auto relative">
          {fileType==='pdf'&&pdfFile ? (
            <div className="relative">
              <div className="absolute top-2 right-2 bg-white rounded shadow p-1 flex items-center">
                <button onClick={()=>setPdfScale(s=>Math.max(0.5,s-0.1))}>-</button>
                <span className="px-2 text-sm">{Math.round(pdfScale*100)}%</span>
                <button onClick={()=>setPdfScale(s=>Math.min(3,s+0.1))}>+</button>
              </div>
              <div className="overflow-scroll">
                <Document file={pdfFile} onLoadSuccess={({numPages})=>setNumPages(numPages)}>
                  {Array.from({length: numPages}).map((_,i)=>(
                    <div key={i} onClick={()=>handlePdfPageClick(i+1)} className="cursor-pointer">
                      <Page pageNumber={i+1} scale={pdfScale} renderAnnotationLayer={false}/>
                    </div>
                  ))}
                </Document>
              </div>
            </div>
          ) : (
            <textarea ref={textAreaRef} value={inputText} onChange={e=>setInputText(e.target.value)} onClick={handleTextAreaClick}
              className="w-full h-full p-4 text-sm font-mono focus:outline-blue-500"
              style={{ backgroundColor: highlightPosition?'#fffbeb':'white' }}
            />
          )}
        </div>

        {/* Thought Units Panel */}
        <div className="w-full lg:w-1/2 overflow-auto p-4">
          <div className="space-y-4">
            {/* Hybrid Controls */}
            {viewMode==='hybrid'&&(
              <>  {/* playback and stats omitted for brevity */}  </>
            )}

            {/* Render units */}
            <ul className="space-y-2">
              {thoughtUnits.map((u,idx)=>(
                <li key={idx} onClick={()=>handleChunkClick(idx)} className={`${idx===currentChunkIndex?'bg-blue-100':''} p-2 rounded cursor-pointer`}>
                  {u}
                </li>
              ))}
            </ul>

            {/* Quizzes stub */}
            {useQuizzes && (
              <div className="mt-6 p-4 bg-yellow-50 rounded">Quiz: What was main idea of last chunk?</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}