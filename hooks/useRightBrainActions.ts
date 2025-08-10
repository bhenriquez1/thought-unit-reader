// hooks/useRightBrainActions.ts
import { useState } from "react";
import { generateMnemonic } from "@/lib/mnemonicAI";
import summarizeText from "@/lib/aiSummary";
import { createFlashcardFromSelection } from "@/lib/flashcardService";
import { addMindMapNode } from "@/lib/mindMapService";
import { startReviewSession, autoGradeFlashcard } from "@/lib/aiReview";

export function useRightBrainActions(
  userId?: string | null,
  bookId?: string | null,
  currentPage?: number
) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<any[]>([]);
  const [currentCard, setCurrentCard] = useState<any | null>(null);

  /** ── Mnemonic ─────────────────────────────────────────────────────────── */
  const addMnemonic = async (text: string) => {
    const t = text?.trim();
    if (!t) {
      alert("Highlight or enter text first.");
      return "";
    }
    setIsGenerating(true);
    try {
      return await generateMnemonic(t);
    } finally {
      setIsGenerating(false);
    }
  };

  /** ── AI Summary ──────────────────────────────────────────────────────── */
  const addAISummary = async (text: string) => {
    const t = text?.trim();
    if (!t) {
      alert("Highlight or enter text first.");
      return "";
    }
    setIsGenerating(true);
    try {
      return await summarizeText(t);
    } finally {
      setIsGenerating(false);
    }
  };

  /** ── Create Flashcard ────────────────────────────────────────────────── */
  const createFlashcard = async (front: string, back = "") => {
    if (!userId) {
      alert("Sign in to save flashcards.");
      return;
    }
    const payload = back ? `${front}\n—\n${back}` : front;
    await createFlashcardFromSelection(payload, currentPage);
    alert("📇 Flashcard saved!");
  };

  /** ── Mind Map ────────────────────────────────────────────────────────── */
  const addMindMap = async (content: string) => {
    if (!userId) {
      alert("Sign in to save to mind map.");
      return;
    }
    await addMindMapNode(content, currentPage);
    alert("🗺️ Mind Map node saved!");
  };

  /** ── Auto Link to Page (helper) ──────────────────────────────────────── */
  const autoLinkPage = (text: string) => ({
    text,
    pageLink: `book://${bookId ?? ""}#page=${currentPage ?? 1}`,
  });

  /** ── Voice-to-Text (Web Speech API) ──────────────────────────────────── */
  const startVoiceNote = (onResult: (text: string) => void) => {
    if (typeof window === "undefined") return;
    const SR: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    setIsListening(true);

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      onResult(transcript.trim());
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    try {
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  /** ── Read Aloud (Web Speech API) ─────────────────────────────────────── */
  const readAloud = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth: SpeechSynthesis = window.speechSynthesis;
    try {
      synth.cancel();
    } catch {}
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.rate = 1;
    utter.pitch = 1;
    synth.speak(utter);
  };

  /** ── Review Mode (uses lib/aiReview) ─────────────────────────────────── */
  const startReview = async () => {
    if (!userId) {
      alert("⚠️ Please sign in to review cards.");
      return;
    }
    try {
      const { cards } = await startReviewSession(userId);
      if (!cards || cards.length === 0) {
        alert("🎉 No cards due for review.");
        return;
      }
      setReviewQueue(cards);
      setCurrentCard(cards[0]);
      setIsReviewMode(true);
    } catch (err) {
      console.error("❌ Error starting review mode:", err);
      alert("Failed to start review mode.");
    }
  };

  const gradeCard = async () => {
    if (!currentCard) return;
    try {
      // Our current autoGrade just returns a suggestion; we still advance the queue.
      await autoGradeFlashcard(
        `${currentCard.front ?? ""} ${currentCard.back ?? ""}`.trim()
      );
    } catch (err) {
      console.error("❌ Error auto-grading card:", err);
    } finally {
      const remaining = reviewQueue.slice(1);
      setReviewQueue(remaining);
      setCurrentCard(remaining[0] || null);
      if (remaining.length === 0) {
        alert("✅ Review complete!");
        setIsReviewMode(false);
      }
    }
  };

  return {
    // state
    isGenerating,
    isListening,
    isReviewMode,
    reviewQueue,
    currentCard,
    // actions
    addMnemonic,
    addAISummary,
    createFlashcard,
    addMindMap,
    autoLinkPage,
    startVoiceNote,
    readAloud,
    startReview,
    gradeCard,
  };
}