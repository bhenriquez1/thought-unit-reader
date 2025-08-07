// components/Whiteboard.tsx
import React, { useEffect, useRef, useState } from "react";
import { WhiteboardStep } from "../lib/WhiteboardExplanationService";

interface WhiteboardProps {
  steps: WhiteboardStep[];
  audioBlob?: Blob;
  useAIVoice?: boolean;
  narrationScript?: string;
}

export default function Whiteboard({ steps, audioBlob, useAIVoice = false, narrationScript = "" }: WhiteboardProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (audioBlob && audioRef.current && useAIVoice) {
      const audioURL = URL.createObjectURL(audioBlob);
      audioRef.current.src = audioURL;
    }
  }, [audioBlob, useAIVoice]);

  useEffect(() => {
    if (!canvasRef.current || steps.length === 0) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    const current = steps[currentStepIndex];
    ctx.font = "20px Arial";
    ctx.fillStyle = "black";
    ctx.fillText(current.title, 20, 40);
    ctx.fillText(current.description, 20, 80);
  }, [currentStepIndex, steps]);

  const handlePlay = () => {
    if (audioRef.current && useAIVoice) {
      audioRef.current.play();
    } else if (!useAIVoice && window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(narrationScript);
      utterance.lang = "en-US";
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }

    let step = 0;
    const interval = setInterval(() => {
      setCurrentStepIndex(step);
      step++;
      if (step >= steps.length) clearInterval(interval);
    }, 4000);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas ref={canvasRef} width={800} height={400} className="border rounded" />
      {useAIVoice && <audio ref={audioRef} controls className="mt-2" />}
      <button
        onClick={handlePlay}
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
      >
        ▶️ Play Explanation
      </button>
    </div>
  );
}