// lib/cognitive/smartSpeechEngine.ts
// Smart Speech Engine - Exam Emphasis Mode with Thought Units
// Chunks text, highlights, pauses on definitions/thresholds/exceptions

import type {
  KnowledgeCard,
  PageContext,
  ExamType,
  SpeechChunk,
  ExamEmphasisPlan,
  SmartSpeechEngine,
  EvidenceSpan,
} from './types';

// ============================================================================
// Chunk Kind Detection
// ============================================================================

type ChunkKind = SpeechChunk['kind'];

interface ChunkPattern {
  kind: ChunkKind;
  patterns: RegExp[];
  pauseMs: number;
  promptTemplate?: string;
}

const CHUNK_PATTERNS: ChunkPattern[] = [
  {
    kind: 'definition',
    patterns: [
      /\bis\s+defined\s+as\b/i,
      /\bdefinition\b/i,
      /\brefers\s+to\b/i,
      /\bis\s+characterized\s+by\b/i,
      /^[A-Z][a-z]+\s+is\s+/,
    ],
    pauseMs: 800,
    promptTemplate: 'Define "{term}" in your own words.',
  },
  {
    kind: 'threshold',
    patterns: [
      /\b\d+\s*(mm|cm|mg|ml|%|mmHg|mmol)\b/i,
      /\b[<>≥≤]\s*\d+/,
      /\bgreater\s+than\s+\d+/i,
      /\bless\s+than\s+\d+/i,
      /\bcutoff\b|\bthreshold\b/i,
      /\bstage\s+(I|II|III|IV)\b/i,
    ],
    pauseMs: 1000,
    promptTemplate: 'Remember this number: {number}. What happens if exceeded?',
  },
  {
    kind: 'exception',
    patterns: [
      /\bexcept\b/i,
      /\bhowever\b/i,
      /\bunlike\b/i,
      /\bin\s+contrast\b/i,
      /\bonly\s+when\b/i,
      /\brationally?\b/i,
    ],
    pauseMs: 1200,
    promptTemplate: 'EXCEPTION ALERT: "{text}". What breaks the rule?',
  },
  {
    kind: 'trap',
    patterns: [
      /\bvs\.?\s+\w+/i,
      /\bdistinguish\b/i,
      /\bdifferentiate\b/i,
      /\bconfuse[ds]?\b/i,
      /\bsimilar\s+to\b/i,
      /\blook[- ]alike\b/i,
    ],
    pauseMs: 1500,
    promptTemplate: 'TRAP ZONE: "{text}". What\'s the key difference?',
  },
];

// ============================================================================
// Text Chunking
// ============================================================================

function splitIntoThoughtUnits(text: string): string[] {
  // Split on sentence boundaries, but keep related clauses together
  const sentences = text.split(/(?<=[.!?])\s+/);

  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    // If sentence is short, combine with previous
    if (sentence.length < 40 && currentChunk) {
      currentChunk += ' ' + sentence;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
    }

    // If chunk is getting long, split on natural break points
    if (currentChunk.length > 150) {
      const breakPoints = [
        /;\s+/,      // semicolon
        /,\s+and\s+/i,  // comma + and
        /,\s+or\s+/i,   // comma + or
        /:\s+/,      // colon
        /\s+-\s+/,   // dash
      ];

      for (const bp of breakPoints) {
        const parts = currentChunk.split(bp);
        if (parts.length > 1 && parts[0].length > 30) {
          chunks.push(parts[0].trim());
          currentChunk = parts.slice(1).join(bp.source.replace(/\\s\+/g, ' '));
          break;
        }
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter(c => c.length > 10);
}

function detectChunkKind(text: string): ChunkKind {
  for (const pattern of CHUNK_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(text)) {
        return pattern.kind;
      }
    }
  }
  return 'normal';
}

function getPauseMs(kind: ChunkKind): number {
  const pattern = CHUNK_PATTERNS.find(p => p.kind === kind);
  return pattern?.pauseMs ?? 300;
}

function generatePrompt(kind: ChunkKind, text: string): string | undefined {
  const pattern = CHUNK_PATTERNS.find(p => p.kind === kind);
  if (!pattern?.promptTemplate) return undefined;

  // Extract relevant parts for prompt
  let prompt = pattern.promptTemplate;

  // Try to extract specific terms
  const termMatch = text.match(/^([A-Z][a-z]+(?:\s+[a-z]+)?)/);
  if (termMatch) {
    prompt = prompt.replace('{term}', termMatch[1]);
  }

  const numberMatch = text.match(/\d+(?:\.\d+)?\s*(?:mm|mg|%|mmHg)?/);
  if (numberMatch) {
    prompt = prompt.replace('{number}', numberMatch[0]);
  }

  prompt = prompt.replace('{text}', text.slice(0, 50));

  return prompt;
}

// ============================================================================
// Speech Chunk Creation
// ============================================================================

function createSpeechChunk(
  text: string,
  pageIndex: number,
  index: number,
  docId: string
): SpeechChunk {
  const kind = detectChunkKind(text);

  return {
    id: `chunk_${pageIndex}_${index}`,
    pageIndex,
    text,
    kind,
    evidence: [{
      docId,
      pageIndex,
      text: text.slice(0, 100),
    }],
  };
}

// ============================================================================
// Plan Generation
// ============================================================================

export function planFromPage(
  docId: string,
  pageIndex: number,
  cards: KnowledgeCard[],
  examType: ExamType
): ExamEmphasisPlan {
  // Get cards from this page
  const pageCards = cards.filter(c => c.pageRefs.includes(pageIndex));

  // Combine card content into text
  const pageText = pageCards
    .map(c => `${c.title}. ${c.summary}`)
    .join(' ');

  // Split into thought units
  const thoughtUnits = splitIntoThoughtUnits(pageText);

  // Create speech chunks
  const chunks: SpeechChunk[] = thoughtUnits.map((text, i) =>
    createSpeechChunk(text, pageIndex, i, docId)
  );

  // Generate pauses
  const pauses: ExamEmphasisPlan['pauses'] = [];
  for (const chunk of chunks) {
    if (chunk.kind !== 'normal') {
      pauses.push({
        chunkId: chunk.id,
        reason: chunk.kind as 'definition' | 'threshold' | 'exception',
      });
    }
  }

  // Generate highlights
  const highlights: ExamEmphasisPlan['highlights'] = chunks
    .filter(c => c.kind !== 'normal')
    .map(c => ({
      chunkId: c.id,
      evidence: c.evidence || [],
    }));

  // Generate prompts for special chunks
  const prompts: ExamEmphasisPlan['prompts'] = [];
  for (const chunk of chunks) {
    const prompt = generatePrompt(chunk.kind, chunk.text);
    if (prompt) {
      prompts.push({
        chunkId: chunk.id,
        prompt,
      });
    }
  }

  return {
    docId,
    examType,
    chunks,
    pauses,
    highlights,
    prompts,
  };
}

export function planFromCards(
  cards: KnowledgeCard[],
  examType: ExamType
): ExamEmphasisPlan {
  if (cards.length === 0) {
    return {
      docId: '',
      examType,
      chunks: [],
      pauses: [],
      highlights: [],
      prompts: [],
    };
  }

  const docId = cards[0].docId;
  const pageIndex = cards[0].pageRefs[0] ?? 0;

  return planFromPage(docId, pageIndex, cards, examType);
}

// ============================================================================
// Speech Text Generation
// ============================================================================

export function generateSpeechText(
  plan: ExamEmphasisPlan,
  mode: 'normal' | 'exam-emphasis' = 'exam-emphasis'
): string {
  if (mode === 'normal') {
    return plan.chunks.map(c => c.text).join(' ');
  }

  // Exam emphasis mode: add callouts
  const parts: string[] = [];

  for (const chunk of plan.chunks) {
    if (chunk.kind === 'definition') {
      parts.push(`[DEFINITION] ${chunk.text}`);
    } else if (chunk.kind === 'threshold') {
      parts.push(`[REMEMBER THIS NUMBER] ${chunk.text}`);
    } else if (chunk.kind === 'exception') {
      parts.push(`[EXCEPTION - PAY ATTENTION] ${chunk.text}`);
    } else if (chunk.kind === 'trap') {
      parts.push(`[COMMON TRAP] ${chunk.text}`);
    } else {
      parts.push(chunk.text);
    }
  }

  return parts.join(' ');
}

export function getChunkTiming(
  plan: ExamEmphasisPlan,
  wordsPerMinute: number = 150
): Array<{ chunkId: string; startMs: number; durationMs: number; pauseMs: number }> {
  const timings: Array<{ chunkId: string; startMs: number; durationMs: number; pauseMs: number }> = [];
  let currentTime = 0;

  for (const chunk of plan.chunks) {
    const wordCount = chunk.text.split(/\s+/).length;
    const durationMs = Math.round((wordCount / wordsPerMinute) * 60 * 1000);
    const pauseMs = getPauseMs(chunk.kind);

    timings.push({
      chunkId: chunk.id,
      startMs: currentTime,
      durationMs,
      pauseMs,
    });

    currentTime += durationMs + pauseMs;
  }

  return timings;
}

export const smartSpeechEngine: SmartSpeechEngine = {
  planFromPage,
};

export default smartSpeechEngine;
