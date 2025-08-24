"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WhiteboardStep } from "@/lib/WhiteboardExplanationService";
import Whiteboard from "./Whiteboard";
import { Button } from "./ui/button";
import { AnimatePresence, motion } from "framer-motion";
import { useReaderSync } from "@/lib/readerSync";
import { 
  generateChapterAnimation, 
  detectChapterTransition, 
  createChapterId,
  containsDiagramOrFormula as defaultContainsDiagramOrFormula,
  chapterAnimationCache
} from "@/lib/chapterAnimations";

/** Simple, fast hash for cache keys */
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/** Enhanced diagram/formula heuristic */
function defaultDiagramHeuristic(text: string): boolean {
  const t = (text || "").toLowerCase();
  if (/\b(diagram|figure|fig\.|table|chart|graph|flow|formula|equation|reaction|proof|process|method|step|procedure)\b/.test(t))
    return true;
  if (/[∑∏∫√≈≠≤≥→↔⇌Δ±∞μ°Ωπθαβγλ≃≅⊂⊃∈∉∧∨⊗◦]/.test(text)) return true;
  // Enhanced detection for educational content
  if (/\b(how to|steps to|process of|mechanism|pathway|cycle|structure|function)\b/.test(t)) return true;
  return false;
}

type StickyNote = { pageNumber: number; content: string };

type Props = {
  concept: string;
  context: string;
  stickyNotes?: StickyNote[];
  /** Run once on mount when true */
  autoTrigger?: boolean;
  lessonTitle?: string;

  /** 🔐 Optional: for step-note persistence in Firestore */
  lessonId?: string; // e.g., your bookId or a slug of lessonTitle
  userId?: string;   // current user id

  /** Enhanced: auto refresh when page changes with smooth animations */
  reExplainOnPageChange?: boolean;
  currentPage?: number;

  /** Optional override for the diagram detector used by auto-refresh */
  containsDiagramOrFormula?: (text: string) => boolean;

  /** Optional: max cached entries in-memory + localStorage mirror */
  cacheSize?: number; // default 20

  /** Enhanced voice settings */
  selectedVoice?: SpeechSynthesisVoice;
  onVoiceChange?: (voice: SpeechSynthesisVoice) => void;
  speechRate?: number;
  onSpeechRateChange?: (rate: number) => void;
  naturalVoiceEnabled?: boolean;
};

/** In-memory LRU-ish cache (oldest evicted on overflow) */
const memCache = new Map<
  string,
  { steps: WhiteboardStep[]; narrationScript: string; audioDataUrl?: string }
>();

export default function EnhancedWhiteboard({
  concept,
  context,
  stickyNotes = [],
  autoTrigger = false,
  lessonTitle = "Whiteboard Lesson",
  lessonId,
  userId,

  reExplainOnPageChange = false,
  currentPage,
  containsDiagramOrFormula = defaultDiagramHeuristic,
  cacheSize = 20,

  // Enhanced voice settings
  selectedVoice,
  onVoiceChange,
  speechRate = 1.0,
  onSpeechRateChange,
  naturalVoiceEnabled = true,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<WhiteboardStep[]>([]);
  const [narrationScript, setNarrationScript] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(speechRate);

  // Enhanced UX with natural animations
  const [isOpen, setIsOpen] = useState(true);
  const [zoom, setZoom] = useState(0.95);
  const [justGenerated, setJustGenerated] = useState(false);
  const [justDetected, setJustDetected] = useState(false);
  const [pulseExplain, setPulseExplain] = useState(false);
  const [showDetectedChip, setShowDetectedChip] = useState(false);
  const [pageFollowAnimation, setPageFollowAnimation] = useState(false);
  
  // Enhanced voice controls
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentUtterance, setCurrentUtterance] = useState<SpeechSynthesisUtterance | null>(null);
  const [voicePreview, setVoicePreview] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);
  const lastCallTsRef = useRef<number>(0);
  const previousPageRef = useRef<number>(currentPage || 1);

  const effectiveConcept = (concept || "").trim();
  const effectiveContext = (context || "").trim();

  // Enhanced chapter-synced animation state
  const { 
    tableOfContents, 
    setCurrentChapter, 
    cacheAnimationScript, 
    getAnimationScript 
  } = useReaderSync();
  const [chapterAnimationActive, setChapterAnimationActive] = useState(false);
  const [currentChapterInfo, setCurrentChapterInfo] = useState<any>(null);

  // Load available voices with enhanced filtering
  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      // Filter for natural-sounding English voices
      const naturalVoices = voices.filter(voice => {
        const name = voice.name.toLowerCase();
        const lang = voice.lang.toLowerCase();
        return (
          lang.startsWith('en') && 
          (name.includes('neural') || 
           name.includes('premium') || 
           name.includes('enhanced') ||
           name.includes('natural') ||
           voice.localService === false) // Often cloud-based, higher quality
        );
      });
      setAvailableVoices(naturalVoices.length > 0 ? naturalVoices : voices.filter(v => v.lang.startsWith('en')));
    };
    
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
    
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

  // Sync playback speed with speech rate
  useEffect(() => {
    setPlaybackSpeed(speechRate);
  }, [speechRate]);

  /** Build stable cache key */
  const cacheKey = useMemo(() => {
    const base = JSON.stringify({
      lessonId: lessonId || lessonTitle || "lesson",
      page: currentPage || 0,
      cHash: hashString(effectiveConcept),
      xHash: hashString(effectiveContext),
    });
    return `wb:${hashString(base)}`;
  }, [lessonId, lessonTitle, currentPage, effectiveConcept, effectiveContext]);

  /** Enhanced speech function with natural voice and Speechify-like features */
  const speakText = useCallback(async (text: string, options?: { rate?: number; voice?: SpeechSynthesisVoice }) => {
    if (!text.trim() || !naturalVoiceEnabled) return;
    
    // Cancel any existing speech
    speechSynthesis.cancel();
    setIsSpeaking(false);
    
    // Enhanced natural voice processing
    const processedText = text
      .replace(/\b(diagram|figure|chart|graph)\b/gi, '$1 visualization')
      .replace(/\b(formula|equation)\b/gi, 'mathematical $1')
      .replace(/\b(step \d+|phase \d+)\b/gi, 'step number $1')
      .replace(/([.!?])\s+/g, '$1... ') // Add natural pauses
      .replace(/,\s+/g, ', ... '); // Shorter pauses for commas
    
    // Use Enhanced Speech Service for better quality
    try {
      const { EnhancedSpeechService } = await import('@/lib/enhancedSpeech');
      const speechService = EnhancedSpeechService.getInstance();
      
      const voiceToUse = options?.voice || selectedVoice || speechService.getBestVoices()[0]?.voice;
      
      await speechService.speak(processedText, {
        voice: voiceToUse,
        rate: options?.rate || speechRate,
        pitch: 1.0,
        volume: 1.0,
        highlightWords: true
      }, 
      // Word boundary callback for highlighting with animations
      (word, charIndex) => {
        // Animate speaking word
        const wordElements = document.querySelectorAll(`[data-word="${word}"]`);
        wordElements.forEach(el => {
          el.classList.add('speaking-word');
          setTimeout(() => el.classList.remove('speaking-word'), 500);
        });
      },
      // On end callback
      () => {
        setIsSpeaking(false);
        setCurrentUtterance(null);
      },
      // On error callback
      (error) => {
        console.error('Enhanced speech error:', error);
        setIsSpeaking(false);
        setCurrentUtterance(null);
      });
      
      setIsSpeaking(true);
    } catch (error) {
      // Enhanced fallback with better voice selection
      console.warn('Enhanced speech not available, using enhanced fallback:', error);
      
      const utterance = new SpeechSynthesisUtterance(processedText);
      
      // Select the most natural voice available
      const naturalVoices = availableVoices.filter(voice => {
        const name = voice.name.toLowerCase();
        return name.includes('neural') || name.includes('premium') || 
               name.includes('enhanced') || name.includes('natural') ||
               !voice.localService; // Cloud voices are often better
      });
      
      const voiceToUse = options?.voice || selectedVoice || naturalVoices[0] || availableVoices[0];
      if (voiceToUse) {
        utterance.voice = voiceToUse;
      }
      
      utterance.rate = (options?.rate || speechRate) * 0.9; // Slightly slower for clarity
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      
      utterance.onstart = () => {
        setIsSpeaking(true);
        setCurrentUtterance(utterance);
      };
      
      utterance.onend = () => {
        setIsSpeaking(false);
        setCurrentUtterance(null);
      };
      
      utterance.onerror = () => {
        setIsSpeaking(false);
        setCurrentUtterance(null);
      };
      
      speechSynthesis.speak(utterance);
    }
  }, [selectedVoice, speechRate, availableVoices, naturalVoiceEnabled]);

  const stopSpeaking = useCallback(() => {
    speechSynthesis.cancel();
    setIsSpeaking(false);
    setCurrentUtterance(null);
  }, []);

  // Voice preview function
  const previewVoice = useCallback((voice: SpeechSynthesisVoice) => {
    setVoicePreview(true);
    speakText("Hello! This is how I sound when explaining concepts on the whiteboard.", { voice });
    setTimeout(() => setVoicePreview(false), 3000);
  }, [speakText]);

  /** Convert a data: URL back to Blob */
  function dataUrlToBlob(dataUrl: string): Blob {
    const [hdr, b64] = dataUrl.split(",");
    const mime = /data:(.*?);base64/.exec(hdr)?.[1] || "audio/mpeg";
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  /** Try to read from localStorage mirror (for a warm reload) */
  const tryLocalRestore = () => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (parsed?.steps && parsed?.narrationScript) {
        setSteps(parsed.steps);
        setNarrationScript(parsed.narrationScript);
        if (parsed.audioDataUrl) {
          try {
            const b = dataUrlToBlob(parsed.audioDataUrl);
            setAudioBlob(b);
          } catch {
            setAudioBlob(null);
          }
        } else {
          setAudioBlob(null);
        }
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  };

  /** Write to both memory cache and localStorage (bounded) */
  const writeCache = (key: string, payload: { steps: WhiteboardStep[]; narrationScript: string; audioBlob?: Blob | null }) => {
    // memory
    memCache.set(key, {
      steps: payload.steps,
      narrationScript: payload.narrationScript,
      audioDataUrl: undefined, // keep memory lean
    });
    // evict oldest
    if (memCache.size > cacheSize) {
      const firstKey = memCache.keys().next().value as string | undefined;
      if (firstKey) memCache.delete(firstKey);
    }

    // localStorage mirror (include audio as dataURL if present)
    try {
      const audioDataUrlPromise = payload.audioBlob
        ? blobToDataURL(payload.audioBlob)
        : Promise.resolve<string | undefined>(undefined);

      audioDataUrlPromise.then((audioDataUrl) => {
        const toStore = JSON.stringify({
          steps: payload.steps,
          narrationScript: payload.narrationScript,
          audioDataUrl,
          savedAt: Date.now(),
        });
        localStorage.setItem(key, toStore);
      }).catch(() => {});
    } catch {
      /* ignore localStorage quota errors */
    }
  };

  /** Try a cache hit (mem → local) */
  const tryCache = (): boolean => {
    const memHit = memCache.get(cacheKey);
    if (memHit?.steps?.length) {
      setSteps(memHit.steps);
      setNarrationScript(memHit.narrationScript);
      setAudioBlob(null); // LS restore may set audio later if needed
      return true;
    }
    return tryLocalRestore();
  };

  /** Enhanced generate call with natural voice narration */
  const runGenerate = useCallback(async () => {
    if (!effectiveConcept || !effectiveContext) return;

    // rate-limit: 1 call / 3s
    const now = Date.now();
    if (now - lastCallTsRef.current < 3000) return;
    lastCallTsRef.current = now;

    // cache first
    if (tryCache()) {
      // Speak the cached narration if available
      if (narrationScript && naturalVoiceEnabled) {
        setTimeout(() => speakText(narrationScript), 500);
      }
      return;
    }

    setLoading(true);
    try {
      const { generateWhiteboardExplanationWithAudio } = await import(
        "@/lib/WhiteboardExplanationService"
      );
      const result = await generateWhiteboardExplanationWithAudio(effectiveConcept, effectiveContext);
      setSteps(result.steps);
      setNarrationScript(result.narrationScript);
      setAudioBlob(result.audioBlob ?? null);

      // Enhanced animations and natural voice
      setJustGenerated(true);
      setTimeout(() => setJustGenerated(false), 1400);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }));

      // Speak the narration with natural voice
      if (result.narrationScript && naturalVoiceEnabled) {
        setTimeout(() => speakText(result.narrationScript), 800);
      }

      writeCache(cacheKey, {
        steps: result.steps,
        narrationScript: result.narrationScript,
        audioBlob: result.audioBlob ?? null,
      });
    } catch (err) {
      console.error("Error generating explanation:", err);
      setAudioBlob(null);
      setSteps([]);
    } finally {
      setLoading(false);
    }
  }, [cacheKey, effectiveConcept, effectiveContext, narrationScript, naturalVoiceEnabled, speakText]);

  /** Manual trigger button */
  const handleExplainConcept = async () => {
    setShowDetectedChip(false);
    await runGenerate();
  };

  /** Auto-trigger once on mount if requested */
  useEffect(() => {
    if (autoTrigger && effectiveConcept && effectiveContext) {
      // Enhanced detection animation
      setJustDetected(true);
      setPulseExplain(true);
      const t1 = setTimeout(() => setJustDetected(false), 2500);
      const t2 = setTimeout(() => setPulseExplain(false), 1400);
      runGenerate();
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTrigger, effectiveConcept, effectiveContext]);

  /** Enhanced chapter transition detection and animation */
  useEffect(() => {
    if (!currentPage || !tableOfContents.length) return;
    
    const previousPage = previousPageRef.current;
    previousPageRef.current = currentPage;
    
    // Detect chapter transitions
    const transition = detectChapterTransition(currentPage, previousPage, tableOfContents);
    
    if (transition.isTransition && transition.chapterInfo) {
      console.log(`🎨 Chapter transition detected: ${transition.chapterInfo.title}`);
      
      const chapterId = createChapterId(transition.chapterInfo.title, currentPage);
      setCurrentChapter(chapterId);
      setCurrentChapterInfo(transition.chapterInfo);
      setChapterAnimationActive(true);
      
      // Check if we have a cached animation for this chapter
      let cachedScript = chapterAnimationCache.get(chapterId);
      
      if (!cachedScript) {
        // Generate new chapter animation
        const chapterScript = generateChapterAnimation(
          chapterId,
          transition.chapterInfo.title,
          effectiveConcept + ' ' + effectiveContext
        );
        
        // Cache the animation script
        chapterAnimationCache.set(chapterId, chapterScript);
        cacheAnimationScript(chapterId, chapterScript.strokes);
        cachedScript = chapterScript;
      }
      
      // Trigger chapter animation
      if (cachedScript && containsDiagramOrFormula(effectiveConcept)) {
        setJustDetected(true);
        setShowDetectedChip(true);
        setPageFollowAnimation(true);
        
        // Convert chapter animation to whiteboard steps
        import('@/lib/chapterAnimations').then(({ strokesToWhiteboardSteps }) => {
          const chapterSteps = strokesToWhiteboardSteps(cachedScript.strokes);
          
          setSteps(chapterSteps);
          setNarrationScript(cachedScript.narrationScript);
          setAudioBlob(null);
          
          // Enhanced chapter transition animations
          setTimeout(() => {
            setJustDetected(false);
            setPageFollowAnimation(false);
            setChapterAnimationActive(false);
          }, 2500);
          
          // Speak chapter introduction
          if (naturalVoiceEnabled && cachedScript.narrationScript) {
            setTimeout(() => {
              speakText(`New chapter: ${transition.chapterInfo.title}. ${cachedScript.narrationScript}`);
            }, 800);
          }
        }).catch(error => {
          console.error('Failed to load chapter animations:', error);
          setChapterAnimationActive(false);
        });
        
        return;
      }
    }
    
    // Fallback to regular page following if no chapter transition
    if (!reExplainOnPageChange) return;
    if (!effectiveConcept || !effectiveContext) return;
    if (!containsDiagramOrFormula(effectiveConcept)) return;

    // Enhanced page follow animation with natural transitions
    setPageFollowAnimation(true);
    setShowDetectedChip(true);
    
    // Staggered animation timing for natural feel
    setTimeout(() => setPageFollowAnimation(false), 1200);
    setTimeout(() => {
      if (narrationScript && naturalVoiceEnabled) {
        speakText(`Following to page ${currentPage}. Let me explain what I see here.`);
      }
    }, 300);

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      runGenerate();
    }, 800) as unknown as number;

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reExplainOnPageChange, currentPage, effectiveConcept, effectiveContext, tableOfContents]);

  // Enhanced keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (!cmd) return;
      
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setZoom((z) => Math.min(1.75, +(z + 0.05).toFixed(2)));
      } else if (e.key === "-") {
        e.preventDefault();
        setZoom((z) => Math.max(0.5, +(z - 0.05).toFixed(2)));
      } else if (e.key.toLowerCase() === "0") {
        e.preventDefault();
        setZoom(1);
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (isSpeaking) {
          stopSpeaking();
        } else if (narrationScript) {
          speakText(narrationScript);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSpeaking, narrationScript, speakText, stopSpeaking]);

  const zoomPct = Math.round(zoom * 100);
  const canRender = steps.length > 0;

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.aside
          key="enhanced-wb-panel"
          initial={{ x: 24, opacity: 0, scale: 0.98 }}
          animate={{ 
            x: 0, 
            opacity: 1, 
            scale: 1,
            // Page follow animation
            ...(pageFollowAnimation && {
              boxShadow: "0 0 0 10px rgba(59, 130, 246, 0.1)"
            })
          }}
          exit={{ x: 24, opacity: 0, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className="flex flex-col gap-3"
        >
          {/* Enhanced Header / Controls */}
          <div className="flex items-center gap-2 flex-wrap relative">
            {/* Enhanced "Diagram detected" pill with page following */}
            <AnimatePresence>
              {justDetected && (
                <motion.div
                  initial={{ y: -10, opacity: 0, scale: 0.95 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ y: -10, opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 260, damping: 22 }}
                  className="text-xs px-3 py-1 rounded-full bg-gradient-to-r from-yellow-500 to-orange-500 text-black shadow-lg font-medium"
                >
                  ✨ Diagram detected - Preparing explanation
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-2">
              <motion.div
                animate={
                  pulseExplain
                    ? {
                        scale: [1, 1.05, 1],
                        boxShadow: [
                          "0 0 0 0",
                          "0 0 0 8px rgba(234,179,8,0.15)",
                          "0 0 0 0",
                        ],
                      }
                    : {}
                }
                transition={{ duration: 1.2, ease: "easeOut" }}
                className="inline-block rounded"
              >
                <Button 
                  onClick={handleExplainConcept} 
                  disabled={loading || !effectiveConcept}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                >
                  {loading ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"
                    />
                  ) : (
                    "🎓"
                  )}
                  {loading ? "Generating..." : "Explain with Whiteboard"}
                </Button>
              </motion.div>

              {canRender && (
                <>
                  <div className="h-6 w-px bg-gray-700 mx-1" />
                  <label className="text-xs opacity-80">Zoom</label>
                  <button
                    className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs transition-colors"
                    onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
                    aria-label="Zoom out"
                    title="Zoom out (Cmd/Ctrl + -)"
                  >
                    −
                  </button>
                  <input
                    className="mx-2 w-36 accent-yellow-400"
                    type="range"
                    min={0.5}
                    max={1.75}
                    step={0.05}
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                  />
                  <span className="text-xs tabular-nums w-10 text-center">{zoomPct}%</span>
                  <button
                    className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs transition-colors"
                    onClick={() => setZoom(1)}
                    title="Reset zoom (Cmd/Ctrl + 0)"
                  >
                    100%
                  </button>
                </>
              )}
            </div>

            <div className="flex-1" />

            {/* Enhanced Voice Controls */}
            {naturalVoiceEnabled && (
              <div className="flex items-center gap-2 p-2 bg-gray-900/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-xs opacity-75">Voice:</span>
                  <select
                    value={selectedVoice?.name || ''}
                    onChange={(e) => {
                      const voice = availableVoices.find(v => v.name === e.target.value);
                      if (voice && onVoiceChange) {
                        onVoiceChange(voice);
                        previewVoice(voice);
                      }
                    }}
                    className="text-xs bg-gray-700 rounded px-2 py-1 max-w-32"
                  >
                    <option value="">Default</option>
                    {availableVoices.map(voice => (
                      <option key={voice.name} value={voice.name}>
                        {voice.name.split(' ')[0]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs opacity-75">Speed:</span>
                  <input
                    type="range"
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    value={speechRate}
                    onChange={(e) => {
                      const rate = Number(e.target.value);
                      onSpeechRateChange?.(rate);
                      setPlaybackSpeed(rate);
                    }}
                    className="w-16 accent-blue-400"
                  />
                  <span className="text-xs tabular-nums w-8">{speechRate}x</span>
                </div>

                <button
                  onClick={() => isSpeaking ? stopSpeaking() : (narrationScript && speakText(narrationScript))}
                  disabled={!narrationScript}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    isSpeaking 
                      ? "bg-red-600 hover:bg-red-500" 
                      : "bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
                  }`}
                  title={isSpeaking ? "Stop speaking (Cmd/Ctrl + S)" : "Speak explanation (Cmd/Ctrl + S)"}
                >
                  {isSpeaking ? (
                    <motion.span
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 0.5, repeat: Infinity }}
                    >
                      ⏹️ Stop
                    </motion.span>
                  ) : (
                    "🎵 Speak"
                  )}
                </button>

                {voicePreview && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="text-xs text-blue-400"
                  >
                    🔊 Preview
                  </motion.span>
                )}
              </div>
            )}

            <button
              onClick={() => setIsOpen(false)}
              className="ml-2 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs transition-colors"
              title="Hide whiteboard"
            >
              ✖
            </button>
          </div>

          {/* Enhanced chip for auto-refresh with page following */}
          {showDetectedChip && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ 
                opacity: 1, 
                y: 0, 
                scale: 1,
                boxShadow: pageFollowAnimation ? 
                  "0 0 0 15px rgba(59, 130, 246, 0.1)" : 
                  "0 0 0 0 rgba(59, 130, 246, 0)"
              }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="text-xs bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-amber-500/20 text-blue-300 px-4 py-3 rounded-lg border border-blue-500/30 inline-block shadow-lg"
            >
              <div className="flex items-center gap-2">
                <motion.span
                  animate={{ 
                    rotate: pageFollowAnimation ? [0, 360] : 0,
                    scale: [1, 1.1, 1] 
                  }}
                  transition={{ 
                    rotate: { duration: 1, ease: "easeInOut" },
                    scale: { duration: 2, repeat: Infinity, ease: "easeInOut" }
                  }}
                  className="text-blue-400"
                >
                  🧠
                </motion.span>
                <div>
                  <div className="font-medium">Following Page {currentPage}</div>
                  <div className="text-xs opacity-90">
                    {pageFollowAnimation ? "Analyzing content..." : "Diagram detected and explained"}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Enhanced Whiteboard stage with natural animations */}
          {canRender ? (
            <motion.div
              ref={scrollRef}
              initial={false}
              animate={
                justGenerated
                  ? { 
                      boxShadow: "0 0 0 2px rgba(234,179,8,0.55), 0 0 30px rgba(234,179,8,0.25)",
                      scale: [0.98, 1.02, 1]
                    }
                  : { 
                      boxShadow: "0 0 0 1px rgba(55,65,81,0.7)",
                      scale: 1
                    }
              }
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="relative rounded-lg bg-gradient-to-br from-black/30 to-gray-900/30 overflow-auto max-h-[70vh] border border-gray-800"
            >
              {/* Enhanced scale wrapper with smooth transitions */}
              <motion.div
                animate={{ scale: zoom }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                style={{ transformOrigin: "top left" }}
                className="origin-top-left inline-block"
              >
                <Whiteboard
                  steps={steps}
                  audioBlob={audioBlob ?? undefined}
                  narrationScript={narrationScript}
                  useAIVoice={!!audioBlob}
                  stickyNotes={stickyNotes}
                  lessonTitle={lessonTitle}
                  baseStepDurationMs={4000}
                  playbackSpeed={playbackSpeed}
                  lessonId={lessonId}
                  userId={userId}
                />
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-gray-300/90 border border-dashed border-gray-700 rounded-lg p-4 text-center"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full"
                  />
                  <span>Preparing enhanced whiteboard explanation…</span>
                </div>
              ) : (
                <>Click &apos;Explain with Whiteboard&apos; to generate an interactive explanation with natural voice.</>
              )}
            </motion.div>
          )}

          {/* Enhanced Sticky notes with animations */}
          {stickyNotes.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="border border-yellow-400/30 p-3 rounded-lg bg-gradient-to-r from-yellow-50/10 to-orange-50/10 text-sm"
            >
              <h3 className="font-semibold mb-2 text-yellow-400">📝 Sticky Notes</h3>
              <ul className="space-y-2">
                {stickyNotes.map((note, idx) => (
                  <motion.li
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="flex items-start gap-2"
                  >
                    <span className="text-yellow-400 font-medium">p.{note.pageNumber}:</span>
                    <span className="text-gray-300">{note.content}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          )}
        </motion.aside>
      )}

      {/* Enhanced collapsed launcher */}
      {!isOpen && (
        <motion.button
          key="enhanced-wb-open"
          initial={{ x: 12, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 12, opacity: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          onClick={() => setIsOpen(true)}
          className="self-end text-xs bg-gradient-to-r from-yellow-500 to-orange-500 text-black px-3 py-2 rounded-lg shadow-lg font-medium"
          title="Show enhanced whiteboard"
        >
          ✨ Enhanced Whiteboard
        </motion.button>
      )}
    </AnimatePresence>
  );
}
