// lib/chapterAnimations.ts
// Chapter-synced whiteboard animation generation system

import type { WhiteboardStep } from "@/lib/WhiteboardExplanationService";

export interface ChapterConcept {
  title: string;
  keyTerms: string[];
  relationships: string[];
  processes: string[];
  visualElements: string[];
}

export interface AnimationStroke {
  type: 'box' | 'arrow' | 'label' | 'connector' | 'highlight';
  text: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  style?: {
    color?: string;
    strokeWidth?: number;
    fill?: string;
    fontSize?: number;
  };
  delay: number;
  duration: number;
  animationType: 'draw' | 'fade' | 'scale' | 'slide';
}

export interface ChapterAnimationScript {
  chapterId: string;
  title: string;
  strokes: AnimationStroke[];
  narrationScript: string;
  totalDuration: number;
}

// Extract key concepts from chapter content
export function analyzeChapterContent(chapterTitle: string, content: string): ChapterConcept {
  const normalizedContent = content.toLowerCase();
  const words = content.split(/\W+/).filter(w => w.length > 3);
  
  // Extract key terms (capitalized words, technical terms)
  const keyTerms = words
    .filter(word => {
      const original = content.match(new RegExp(`\\b${word}\\b`, 'i'))?.[0];
      return original && /^[A-Z]/.test(original);
    })
    .filter((word, index, arr) => arr.indexOf(word) === index)
    .slice(0, 6);
  
  // Find relationship indicators
  const relationshipWords = [
    'causes', 'results in', 'leads to', 'because', 'therefore', 'however',
    'whereas', 'compared to', 'similar to', 'different from', 'relates to'
  ];
  const relationships = relationshipWords.filter(rel => 
    normalizedContent.includes(rel)
  ).slice(0, 3);
  
  // Find process indicators
  const processWords = [
    'process', 'method', 'procedure', 'steps', 'mechanism', 'pathway',
    'cycle', 'sequence', 'algorithm', 'technique', 'approach'
  ];
  const processes = processWords.filter(proc => 
    normalizedContent.includes(proc)
  ).slice(0, 3);
  
  // Find visual elements
  const visualWords = [
    'diagram', 'figure', 'chart', 'graph', 'table', 'image',
    'structure', 'pattern', 'shape', 'form', 'layout'
  ];
  const visualElements = visualWords.filter(vis => 
    normalizedContent.includes(vis)
  ).slice(0, 2);
  
  return {
    title: chapterTitle,
    keyTerms,
    relationships,
    processes,
    visualElements
  };
}

// Generate animation strokes based on chapter concepts
export function generateChapterStrokes(concept: ChapterConcept): AnimationStroke[] {
  const strokes: AnimationStroke[] = [];
  let currentDelay = 0;
  const baseDelay = 800;
  
  // 1. Main title box (center-top)
  strokes.push({
    type: 'box',
    text: concept.title,
    position: { x: 400, y: 80 },
    size: { width: 300, height: 60 },
    style: {
      color: '#fbbf24',
      strokeWidth: 3,
      fill: 'rgba(251, 191, 36, 0.1)',
      fontSize: 18
    },
    delay: currentDelay,
    duration: 1200,
    animationType: 'draw'
  });
  currentDelay += baseDelay;
  
  // 2. Key terms as connected boxes
  concept.keyTerms.slice(0, 4).forEach((term, index) => {
    const angle = (index * Math.PI * 2) / Math.min(4, concept.keyTerms.length);
    const radius = 150;
    const x = 400 + Math.cos(angle) * radius;
    const y = 200 + Math.sin(angle) * radius;
    
    // Term box
    strokes.push({
      type: 'box',
      text: term,
      position: { x: x - 60, y: y - 20 },
      size: { width: 120, height: 40 },
      style: {
        color: '#3b82f6',
        strokeWidth: 2,
        fill: 'rgba(59, 130, 246, 0.1)',
        fontSize: 14
      },
      delay: currentDelay,
      duration: 1000,
      animationType: 'scale'
    });
    
    // Connector arrow from title to term
    strokes.push({
      type: 'arrow',
      text: '',
      position: { x: 400, y: 140 },
      size: { width: x - 400, height: y - 140 },
      style: {
        color: '#6b7280',
        strokeWidth: 2
      },
      delay: currentDelay + 300,
      duration: 800,
      animationType: 'draw'
    });
    
    currentDelay += baseDelay * 0.6;
  });
  
  // 3. Process flow (if processes detected)
  if (concept.processes.length > 0) {
    const processY = 350;
    concept.processes.slice(0, 3).forEach((process, index) => {
      const x = 200 + index * 200;
      
      strokes.push({
        type: 'box',
        text: process,
        position: { x: x - 80, y: processY - 20 },
        size: { width: 160, height: 40 },
        style: {
          color: '#10b981',
          strokeWidth: 2,
          fill: 'rgba(16, 185, 129, 0.1)',
          fontSize: 12
        },
        delay: currentDelay,
        duration: 1000,
        animationType: 'slide'
      });
      
      // Arrow to next process
      if (index < concept.processes.length - 1 && index < 2) {
        strokes.push({
          type: 'arrow',
          text: '',
          position: { x: x + 80, y: processY },
          size: { width: 120, height: 0 },
          style: {
            color: '#10b981',
            strokeWidth: 2
          },
          delay: currentDelay + 500,
          duration: 600,
          animationType: 'draw'
        });
      }
      
      currentDelay += baseDelay * 0.8;
    });
  }
  
  // 4. Relationship indicators
  if (concept.relationships.length > 0) {
    strokes.push({
      type: 'label',
      text: `Key relationships: ${concept.relationships.join(', ')}`,
      position: { x: 50, y: 450 },
      style: {
        color: '#8b5cf6',
        fontSize: 12
      },
      delay: currentDelay,
      duration: 1000,
      animationType: 'fade'
    });
    currentDelay += baseDelay;
  }
  
  // 5. Visual elements highlight
  if (concept.visualElements.length > 0) {
    strokes.push({
      type: 'highlight',
      text: `📊 Contains: ${concept.visualElements.join(', ')}`,
      position: { x: 50, y: 480 },
      style: {
        color: '#f59e0b',
        fontSize: 12
      },
      delay: currentDelay,
      duration: 1200,
      animationType: 'fade'
    });
  }
  
  return strokes;
}

// Generate narration script for chapter animation
export function generateNarrationScript(concept: ChapterConcept): string {
  const parts: string[] = [];
  
  // Introduction
  parts.push(`Let's explore ${concept.title}.`);
  
  // Key terms
  if (concept.keyTerms.length > 0) {
    parts.push(`The main concepts here are ${concept.keyTerms.slice(0, 3).join(', ')}.`);
  }
  
  // Processes
  if (concept.processes.length > 0) {
    parts.push(`This involves ${concept.processes.join(' and ')}.`);
  }
  
  // Relationships
  if (concept.relationships.length > 0) {
    parts.push(`Pay attention to how these elements ${concept.relationships[0]}.`);
  }
  
  // Visual elements
  if (concept.visualElements.length > 0) {
    parts.push(`Look for ${concept.visualElements.join(' and ')} to help visualize these concepts.`);
  }
  
  // Conclusion
  parts.push(`Understanding these connections will help you grasp the bigger picture.`);
  
  return parts.join(' ');
}

// Convert animation strokes to WhiteboardStep format
export function strokesToWhiteboardSteps(strokes: AnimationStroke[]): WhiteboardStep[] {
  return strokes.map((stroke, index) => ({
    type: stroke.type === 'box' || stroke.type === 'arrow' || stroke.type === 'connector' ? 'draw' : 'text',
    payload: {
      id: `stroke-${index}`,
      content: stroke.text,
      position: stroke.position,
      size: stroke.size,
      style: {
        stroke: stroke.style?.color || '#ffffff',
        strokeWidth: stroke.style?.strokeWidth || 2,
        fill: stroke.style?.fill || 'none',
        fontSize: stroke.style?.fontSize || 14,
        ...stroke.style
      },
      animation: {
        type: stroke.animationType,
        duration: stroke.duration,
        delay: stroke.delay,
        easing: 'ease-out'
      },
      roughness: 1.5,
      bowing: 0.5,
      strokeType: stroke.type
    },
    delayMs: stroke.delay,
    title: stroke.text || `${stroke.type} ${index + 1}`,
    description: stroke.text,
    visualPrompt: `Draw a ${stroke.type} with text: ${stroke.text}`
  }));
}

// Main function to generate complete chapter animation
export function generateChapterAnimation(
  chapterId: string,
  chapterTitle: string,
  content: string
): ChapterAnimationScript {
  console.log(`🎨 Generating chapter animation for: ${chapterTitle}`);
  
  // Analyze chapter content
  const concept = analyzeChapterContent(chapterTitle, content);
  
  // Generate animation strokes
  const strokes = generateChapterStrokes(concept);
  
  // Generate narration
  const narrationScript = generateNarrationScript(concept);
  
  // Calculate total duration
  const totalDuration = Math.max(
    ...strokes.map(s => s.delay + s.duration),
    5000 // Minimum 5 seconds
  );
  
  const script: ChapterAnimationScript = {
    chapterId,
    title: chapterTitle,
    strokes,
    narrationScript,
    totalDuration
  };
  
  console.log(`🎨 Generated ${strokes.length} strokes, duration: ${totalDuration}ms`);
  return script;
}

// Detect if content contains diagram-worthy material
export function containsDiagramOrFormula(text: string): boolean {
  const indicators = [
    // Explicit visual references
    /\b(diagram|figure|fig\.|chart|graph|table|image|illustration)\b/i,
    
    // Mathematical content
    /[∑∏∫√≈≠≤≥→↔⇌Δ±∞μ°Ωπθαβγλ≃≅⊂⊃∈∉∧∨⊗◦]/,
    /\\[a-zA-Z]+\{/,
    
    // Process/structure indicators
    /\b(process|method|procedure|steps|mechanism|pathway|cycle|sequence|structure|system|function|algorithm)\b/i,
    
    // Relationship indicators
    /\b(causes?|results? in|leads? to|because|therefore|however|whereas|compared to|similar to|different from)\b/i,
    
    // Lists and enumerations
    /^\s*[\d\w]\.\s/m,
    /^\s*[-•*]\s/m,
    
    // Technical/scientific terms
    /\b(analysis|theory|concept|principle|hypothesis|model|framework|approach|technique)\b/i
  ];
  
  return indicators.some(pattern => pattern.test(text));
}

// Cache for generated animations
export class ChapterAnimationCache {
  private cache = new Map<string, ChapterAnimationScript>();
  private maxSize: number;
  
  constructor(maxSize: number = 20) {
    this.maxSize = maxSize;
  }
  
  get(chapterId: string): ChapterAnimationScript | undefined {
    const item = this.cache.get(chapterId);
    if (item) {
      // Move to end (most recently used)
      this.cache.delete(chapterId);
      this.cache.set(chapterId, item);
    }
    return item;
  }
  
  set(chapterId: string, script: ChapterAnimationScript): void {
    // Remove if already exists
    if (this.cache.has(chapterId)) {
      this.cache.delete(chapterId);
    }
    
    // Add to end
    this.cache.set(chapterId, script);
    
    // Evict oldest if over limit
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  has(chapterId: string): boolean {
    return this.cache.has(chapterId);
  }
}

// Global animation cache
export const chapterAnimationCache = new ChapterAnimationCache(25);

// Helper to create chapter ID from title and page
export function createChapterId(title: string, page: number): string {
  const normalized = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50);
  return `chapter-${page}-${normalized}`;
}

// Detect chapter transitions
export function detectChapterTransition(
  currentPage: number,
  previousPage: number,
  tableOfContents: any[]
): { isTransition: boolean; chapterInfo?: any } {
  if (!tableOfContents.length || currentPage === previousPage) {
    return { isTransition: false };
  }
  
  // Find chapter that starts on current page
  const currentChapter = tableOfContents.find(toc => {
    const tocPage = toc.pageNumber || toc.page;
    return tocPage === currentPage;
  });
  
  if (currentChapter) {
    return {
      isTransition: true,
      chapterInfo: currentChapter
    };
  }
  
  // Check if we've moved to a new chapter (even if not on first page)
  const getCurrentChapter = (page: number) => {
    let current = null;
    for (const toc of tableOfContents) {
      const tocPage = toc.pageNumber || toc.page;
      if (tocPage <= page) {
        current = toc;
      } else {
        break;
      }
    }
    return current;
  };
  
  const currentChapterInfo = getCurrentChapter(currentPage);
  const previousChapterInfo = getCurrentChapter(previousPage);
  
  if (currentChapterInfo && previousChapterInfo && 
      currentChapterInfo.title !== previousChapterInfo.title) {
    return {
      isTransition: true,
      chapterInfo: currentChapterInfo
    };
  }
  
  return { isTransition: false };
}
