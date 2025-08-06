import { useState } from "react";
import { generateMnemonic } from "@/lib/mnemonicAI";
import { generateAISummary } from "@/lib/summaryAI"; // ← You will create this
import { saveFlashcard } from "@/lib/noteService";
import { saveMindMapNode } from "@/lib/mindMapService";
import { startReviewSession, autoGradeFlashcard } from "@/lib/aiReview";
import { SpeechRecognitionAPI, SpeechSynthesisAPI } from "@/lib/voiceTools"; // ← You will create this

export function useRightBrainActions(userId: string, bookId: string, currentPage?: number) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<any[]>([]);
  const [currentCard, setCurrentCard] = useState<any | null>(null);
  const [isReviewMode, setIsReviewMode] = useState(false);

  /** ===== Mnemonic ===== **/
  const addMnemonic = async (text: string) => {
    if (!text.trim()) return alert("Highlight or enter text first.");
    setIsGenerating(true);
    const mnemonic = await generateMnemonic(text);
    setIsGenerating(false);
    return mnemonic;
  };

  /** ===== AI Summary ===== **/
  const addAISummary = async (text: string) => {
    if (!text.trim()) return alert("Highlight or enter text first.");
    setIsGenerating(true);
    const summary = await generateAISummary(text);
    setIsGenerating(false);
    return summary;
  };

  /** ===== Create Flashcard ===== **/
  const createFlashcard = async (front: string, back: string) => {
    if (!userId) return alert("Sign in to save flashcards.");
    await saveFlashcard(userId, {
      front,
      back,
      bookId,
      tags: [],
      dueDate: new Date().toISOString()
    });
    alert("📇 Flashcard saved!");
  };

  /** ===== Add Mind Map Node ===== **/
  const addMindMap = async (title: string, content: string, mnemonic?: string) => {
    if (!userId) return alert("Sign in to save to mind map.");
    await saveMindMapNode(userId, {
      title: title || "Untitled",
      content,
      mnemonic: mnemonic || "",
      tags: [],
      attachments: [],
      bookId
    });
    alert("🗺️ Mind Map node saved!");
  };

  /** ===== Auto Link to Page ===== **/
  const autoLinkPage = (text: string) => {
    return {
      text,
      pageLink: `book://${bookId}#page=${currentPage || 1}`
    };
  };

  /** ===== Voice-to-Text ===== **/
  const startVoiceNote = async (onResult: (text: string) => void) => {
    setIsListening(true);
    SpeechRecognitionAPI.start({
      onResult: (result: string) => {
        setIsListening(false);
        onResult(result);
      },
      onError: () => setIsListening(false)
    });
  };

  /** ===== Read Aloud ===== **/
  const readAloud = (text: string) => {
    SpeechSynthesisAPI.speak(text);
  };

  /** ===== Review Mode ===== **/
  const startReview = async () => {
    if (!userId) return;
    const due = await startReviewSession(userId);
    if (due.length === 0) return alert("No cards due for review 🎉");
    setReviewQueue(due);
    setCurrentCard(due[0]);
    setIsReviewMode(true);
  };

  const gradeCard = async () => {
    if (!currentCard) return;
    await autoGradeFlashcard(userId, currentCard.id, currentCard.front, currentCard.back);
    const remaining = reviewQueue.slice(1);
    setReviewQueue(remaining);
    setCurrentCard(remaining[0] || null);
    if (remaining.length === 0) {
      alert("✅ Review complete!");
      setIsReviewMode(false);
    }
  };

  return {
    isGenerating,
    isListening,
    isReviewMode,
    currentCard,
    reviewQueue,
    addMnemonic,
    addAISummary,
    createFlashcard,
    addMindMap,
    autoLinkPage,
    startVoiceNote,
    readAloud,
    startReview,
    gradeCard
  };
}