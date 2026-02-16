// lib/engines/explainEngine.ts
// Page-aware Explain Mode - Generates whiteboard-ready micro-lessons
// Output: ExplainPayload with steps, draw instructions, exam questions, mnemonic

import type {
  DocID,
  PageIndex,
  ChapterID,
  ExplainPayload,
  EvidenceRef,
  ExtractionMode,
  PageExtractionResult,
  ChapterExtractionResult,
  InsightsResult,
  InsightItem,
} from './types';
import { putDocCache, getDocCache } from '../storage/indexedDB';

// ============================================================================
// Explain Generation from Extraction + Insights
// ============================================================================

export interface GenerateExplainOptions {
  extraction: PageExtractionResult | ChapterExtractionResult;
  insights?: InsightsResult;
  title?: string;
}

export async function generateExplain(options: GenerateExplainOptions): Promise<ExplainPayload> {
  const { extraction, insights, title } = options;
  const { docId, text, evidence } = extraction;

  const scope = extraction.mode === 'PAGE'
    ? { mode: 'PAGE' as ExtractionMode, pageIndex: (extraction as PageExtractionResult).pageIndex }
    : { mode: 'CHAPTER' as ExtractionMode, chapterId: (extraction as ChapterExtractionResult).chapterId };

  // Check cache
  const cacheKey = `explain:${scope.pageIndex ?? scope.chapterId}`;
  const cached = await getDocCache<ExplainPayload>(cacheKey);
  if (cached) {
    return cached;
  }

  // Generate explain payload
  const explainTitle = title || generateTitle(text, insights);
  const steps = generateSteps(text, insights);
  const drawInstructions = generateDrawInstructions(text, insights);
  const examQuestions = generateExamQuestions(text, insights);
  const mnemonic = generateMnemonic(text, insights);

  const result: ExplainPayload = {
    docId,
    scope,
    title: explainTitle,
    steps,
    drawInstructions,
    examQuestions,
    mnemonic,
    evidence,
  };

  // Cache result
  await putDocCache(cacheKey, result);

  return result;
}

// ============================================================================
// Title Generation
// ============================================================================

function generateTitle(text: string, insights?: InsightsResult): string {
  // Try to use the most important insight as title
  if (insights?.whatMatters?.[0]) {
    return insights.whatMatters[0].title;
  }

  // Extract key concept from text
  const conceptMatch = text.match(/([A-Z][a-z]+(?:\s+[A-Z]?[a-z]+){0,3})\s+(?:is|are|refers|means)/);
  if (conceptMatch) {
    return conceptMatch[1];
  }

  // Fall back to first capitalized phrase
  const words = text.split(/\s+/).slice(0, 20);
  const capWords = words.filter(w => /^[A-Z]/.test(w));
  if (capWords.length >= 2) {
    return capWords.slice(0, 3).join(' ');
  }

  return 'Page Explanation';
}

// ============================================================================
// Step Generation (3-6 bullet steps)
// ============================================================================

function generateSteps(text: string, insights?: InsightsResult): string[] {
  const steps: string[] = [];

  // Use insights if available
  if (insights?.whatMatters && insights.whatMatters.length > 0) {
    // Step 1: Main definition/concept
    const definition = insights.whatMatters.find(i => i.tags.includes('DEFINITION'));
    if (definition) {
      steps.push(`Define: ${definition.title} - ${definition.summary.slice(0, 80)}`);
    }

    // Step 2-3: Key mechanisms/processes
    const processes = insights.whatMatters.filter(i =>
      !i.tags.includes('DEFINITION') && !i.tags.includes('TRAP')
    );
    for (const proc of processes.slice(0, 2)) {
      steps.push(`Understand: ${proc.summary.slice(0, 100)}`);
    }

    // Step 4: Clinical application
    const clinical = insights.whatMatters.find(i =>
      i.tags.includes('DIAGNOSIS') || i.tags.includes('TREATMENT')
    );
    if (clinical) {
      steps.push(`Apply: ${clinical.summary.slice(0, 100)}`);
    }

    // Step 5: Exceptions/traps
    const traps = insights.whatMatters.filter(i => i.tags.includes('TRAP') || i.tags.includes('EXCEPTION'));
    if (traps.length > 0) {
      steps.push(`Watch out: ${traps[0].summary.slice(0, 100)}`);
    }
  }

  // If not enough steps, extract from text
  if (steps.length < 3) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 30);

    // Find definition sentences
    const defSentences = sentences.filter(s => /\b(is|are|refers|defined)\b/i.test(s));
    if (defSentences.length > 0 && !steps.some(s => s.startsWith('Define'))) {
      steps.push(`Define: ${defSentences[0].trim().slice(0, 100)}`);
    }

    // Find process sentences
    const procSentences = sentences.filter(s => /\b(causes|leads|results|produces)\b/i.test(s));
    for (const proc of procSentences.slice(0, 2)) {
      if (steps.length < 5) {
        steps.push(`Mechanism: ${proc.trim().slice(0, 100)}`);
      }
    }

    // Find clinical sentences
    const clinSentences = sentences.filter(s => /\b(treat|diagnos|present|symptom)\b/i.test(s));
    if (clinSentences.length > 0 && steps.length < 6) {
      steps.push(`Clinical: ${clinSentences[0].trim().slice(0, 100)}`);
    }
  }

  // Ensure 3-6 steps
  return steps.slice(0, 6);
}

// ============================================================================
// Draw Instructions (for whiteboard)
// ============================================================================

function generateDrawInstructions(text: string, insights?: InsightsResult): string[] {
  const instructions: string[] = [];

  // Detect if content is process/pathway focused
  if (/\b(pathway|process|cycle|mechanism|cascade)\b/i.test(text)) {
    instructions.push('Draw a flowchart showing the sequential steps');
    instructions.push('Use arrows to connect each stage');
    instructions.push('Highlight the key trigger/initiator');
  }

  // Detect if content is comparison focused
  if (/\b(vs|versus|compared to|unlike|different from)\b/i.test(text)) {
    instructions.push('Create a comparison table with 2-3 columns');
    instructions.push('List distinguishing features in rows');
    instructions.push('Circle the key differentiating factor');
  }

  // Detect if content has hierarchical structure
  if (/\b(types|categories|classification|divided into)\b/i.test(text)) {
    instructions.push('Draw a tree diagram with main concept at top');
    instructions.push('Branch into subtypes/categories');
    instructions.push('Note key characteristic of each branch');
  }

  // Detect anatomical/structural content
  if (/\b(location|structure|anatomy|part of|contains)\b/i.test(text)) {
    instructions.push('Sketch the anatomical structure');
    instructions.push('Label key components');
    instructions.push('Show spatial relationships');
  }

  // Default instructions if none detected
  if (instructions.length === 0) {
    instructions.push('Draw a concept map with the main term in center');
    instructions.push('Connect related concepts with labeled lines');
    instructions.push('Use different colors for different types of relationships');
  }

  return instructions.slice(0, 3);
}

// ============================================================================
// Exam Question Generation (DAT/med style)
// ============================================================================

function generateExamQuestions(text: string, insights?: InsightsResult): Array<{ q: string; a: string }> {
  const questions: Array<{ q: string; a: string }> = [];

  // Question templates based on insight types
  if (insights?.whatMatters) {
    for (const insight of insights.whatMatters.slice(0, 3)) {
      if (insight.tags.includes('DEFINITION')) {
        questions.push({
          q: `What is the definition of ${insight.title}?`,
          a: insight.summary,
        });
      } else if (insight.tags.includes('DIAGNOSIS')) {
        questions.push({
          q: `A patient presents with the classic findings of ${insight.title}. What is the most likely diagnosis?`,
          a: insight.summary,
        });
      } else if (insight.tags.includes('TREATMENT')) {
        questions.push({
          q: `What is the first-line treatment for ${insight.title}?`,
          a: insight.summary,
        });
      } else if (insight.tags.includes('TRAP') || insight.tags.includes('EXCEPTION')) {
        questions.push({
          q: `Which of the following is an exception to ${insight.title}?`,
          a: insight.summary,
        });
      } else if (insight.tags.includes('HIGH_YIELD')) {
        questions.push({
          q: `Regarding ${insight.title}, which statement is correct?`,
          a: insight.summary,
        });
      }
    }
  }

  // Generate from text if needed
  if (questions.length < 2) {
    // Extract numeric facts for potential questions
    const numericMatches = text.match(/(\d+(?:\.\d+)?)\s*(mg|ml|mm|%|mmHg|days|weeks|years)/gi);
    if (numericMatches && numericMatches.length > 0) {
      const context = text.slice(0, 100);
      questions.push({
        q: `What is the key numeric value associated with this concept?`,
        a: numericMatches[0],
      });
    }

    // Extract cause-effect for potential questions
    const causeMatch = text.match(/([^.]+)\s+(?:causes|leads to|results in)\s+([^.]+)/i);
    if (causeMatch) {
      questions.push({
        q: `What does ${causeMatch[1].trim().slice(0, 50)} cause?`,
        a: causeMatch[2].trim(),
      });
    }
  }

  return questions.slice(0, 3);
}

// ============================================================================
// Mnemonic Generation
// ============================================================================

function generateMnemonic(text: string, insights?: InsightsResult): string | undefined {
  // Look for lists or sequences that could benefit from a mnemonic
  const listPatterns = [
    /(?:include|are|consist of):\s*([^.]+)/i,
    /([A-Z][a-z]+(?:,\s*[A-Z][a-z]+)+)/,
    /(\d\.\s*[^.]+(?:\s+\d\.\s*[^.]+)+)/,
  ];

  for (const pattern of listPatterns) {
    const match = text.match(pattern);
    if (match) {
      const items = match[1].split(/[,;]|\d\.\s*/).filter(s => s.trim().length > 2);
      if (items.length >= 3 && items.length <= 8) {
        // Create acronym mnemonic
        const acronym = items
          .map(item => item.trim()[0]?.toUpperCase() || '')
          .filter(c => /[A-Z]/.test(c))
          .join('');

        if (acronym.length >= 3) {
          return `Remember: ${acronym} (${items.slice(0, 4).map(i => i.trim().slice(0, 20)).join(', ')})`;
        }
      }
    }
  }

  // Check if insights suggest a mnemonic would be helpful
  if (insights?.whatMatters && insights.whatMatters.length >= 3) {
    const titles = insights.whatMatters.slice(0, 5).map(i => i.title);
    const firstLetters = titles.map(t => t[0]?.toUpperCase()).filter(Boolean);
    const acronym = firstLetters.join('');

    if (acronym.length >= 3 && acronym.length <= 6) {
      return `Key points: ${acronym} (${titles.join(', ')})`;
    }
  }

  return undefined;
}

// ============================================================================
// Export
// ============================================================================

export { generateTitle, generateSteps, generateDrawInstructions, generateExamQuestions, generateMnemonic };
