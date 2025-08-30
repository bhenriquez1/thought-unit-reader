/**
 * Concept-Anchored Highlighting System
 * Highlights stay with ideas and concepts, not line positions
 * Solves the "highlights move with page scrolling" problem
 */

import { ThoughtUnit, MainIdeaAnalysis, analyzeTextForThoughtUnits } from './thoughtUnitExtraction';

export interface ConceptAnchor {
  id: string;
  conceptFingerprint: string; // Unique identifier for the concept
  keyPhrases: string[]; // Essential phrases that identify this concept
  semanticMarkers: string[]; // Words/patterns that help re-identify the concept
  confidence: number;
  type: 'main-idea' | 'supporting-detail' | 'transition' | 'definition' | 'example';
  visualCues: {
    color: string;
    intensity: number;
    borderStyle: 'solid' | 'dashed' | 'dotted';
  };
  persistentData: {
    originalText: string;
    contextWords: string[]; // Surrounding words for better matching
    conceptHash: string; // Hash of the core concept for fast comparison
  };
}

export interface ConceptHighlightConfig {
  showMainIdeas: boolean;
  showSupportingDetails: boolean;
  showTransitions: boolean;
  mainIdeaConfidenceThreshold: number;
  highlightSensitivity: 'minimal' | 'moderate' | 'detailed';
  maxMainIdeasPerPage: number;
  conceptPersistence: boolean; // Whether to remember concepts across sessions
}

export class ConceptAnchoredHighlighter {
  private container: HTMLElement;
  private config: ConceptHighlightConfig;
  private conceptAnchors: Map<string, ConceptAnchor> = new Map();
  private activeHighlights: Map<string, HTMLElement[]> = new Map();
  private conceptCache: Map<string, ConceptAnchor[]> = new Map(); // Page-based concept cache

  constructor(container: HTMLElement, config: Partial<ConceptHighlightConfig> = {}) {
    this.container = container;
    this.config = {
      showMainIdeas: true,
      showSupportingDetails: true,
      showTransitions: true,
      mainIdeaConfidenceThreshold: 0.85,
      highlightSensitivity: 'moderate',
      maxMainIdeasPerPage: 2,
      conceptPersistence: true,
      ...config
    };
    
    this.initializeStyles();
  }

  private initializeStyles(): void {
    const styleId = 'concept-anchored-highlighting-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .concept-highlight {
        background-color: rgba(255, 235, 59, 0.3);
        border-radius: 3px;
        transition: all 0.3s ease-in-out;
        position: relative;
        display: inline;
        padding: 1px 2px;
        margin: 0 1px;
      }
      
      .concept-highlight.main-idea {
        background-color: rgba(251, 191, 36, 0.4);
        border-bottom: 2px solid rgba(251, 191, 36, 0.8);
        font-weight: 500;
      }
      
      .concept-highlight.supporting-detail {
        background-color: rgba(96, 165, 250, 0.3);
        border-bottom: 1px solid rgba(96, 165, 250, 0.6);
      }
      
      .concept-highlight.transition {
        background-color: rgba(52, 211, 153, 0.3);
        border-bottom: 1px dotted rgba(52, 211, 153, 0.7);
      }
      
      .concept-highlight.definition {
        background-color: rgba(168, 85, 247, 0.3);
        border-bottom: 1px solid rgba(168, 85, 247, 0.6);
      }
      
      .concept-highlight.example {
        background-color: rgba(249, 115, 22, 0.3);
        border-bottom: 1px dashed rgba(249, 115, 22, 0.6);
      }
      
      .concept-highlight:hover {
        background-color: rgba(255, 235, 59, 0.5);
        transform: scale(1.02);
        z-index: 10;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }
      
      .concept-highlight.focused {
        background-color: rgba(255, 235, 59, 0.6);
        box-shadow: 0 0 8px rgba(255, 235, 59, 0.8);
        z-index: 15;
      }
      
      .concept-tooltip {
        position: absolute;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        max-width: 250px;
        z-index: 20;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease-in-out;
        top: -40px;
        left: 50%;
        transform: translateX(-50%);
        white-space: nowrap;
      }
      
      .concept-highlight:hover .concept-tooltip {
        opacity: 1;
      }
      
      .concept-boundary {
        border-left: 3px solid rgba(251, 191, 36, 0.6);
        padding-left: 8px;
        margin: 4px 0;
        background: linear-gradient(90deg, rgba(251, 191, 36, 0.1), transparent);
      }
    `;
    
    document.head.appendChild(style);
  }

  // Main method to highlight concepts on a page
  public async highlightConcepts(pageText: string, pageNumber: number): Promise<void> {
    try {
      console.log(`🧠 Concept-anchored highlighting for page ${pageNumber}`);
      
      // Clear existing highlights
      this.clearHighlights();
      
      // Check cache first
      const cacheKey = `page-${pageNumber}`;
      let conceptAnchors = this.conceptCache.get(cacheKey);
      
      if (!conceptAnchors) {
        // Analyze text for concepts
        const analysis = analyzeTextForThoughtUnits(pageText, pageNumber);
        
        // Create concept anchors from thought units
        conceptAnchors = this.createConceptAnchors(analysis.thoughtUnits, pageText);
        
        // Cache the concepts for this page
        if (this.config.conceptPersistence) {
          this.conceptCache.set(cacheKey, conceptAnchors);
        }
      }
      
      // Apply concept-based highlighting
      await this.applyConceptHighlights(conceptAnchors, pageText);
      
      console.log(`✅ Applied ${conceptAnchors.length} concept highlights to page ${pageNumber}`);
      
    } catch (error) {
      console.error('Error in concept-anchored highlighting:', error);
    }
  }

  private createConceptAnchors(thoughtUnits: ThoughtUnit[], fullText: string): ConceptAnchor[] {
    const anchors: ConceptAnchor[] = [];
    
    // Filter thought units based on config and sensitivity
    const filteredUnits = thoughtUnits.filter(unit => this.shouldHighlightConcept(unit));
    
    // Apply sensitivity-based filtering
    const sensitivityFilteredUnits = this.applySensitivityFiltering(filteredUnits);
    
    // Limit main ideas per page based on config
    const mainIdeas = sensitivityFilteredUnits.filter(unit => unit.isMainIdea)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.config.maxMainIdeasPerPage);
    
    // Apply sensitivity to other units as well
    const otherUnits = sensitivityFilteredUnits.filter(unit => !unit.isMainIdea);
    const limitedOtherUnits = this.limitOtherUnitsBySensitivity(otherUnits);
    
    // Create anchors for main ideas and other important concepts
    [...mainIdeas, ...limitedOtherUnits].forEach(unit => {
      const anchor = this.createConceptAnchor(unit, fullText);
      if (anchor) {
        anchors.push(anchor);
        this.conceptAnchors.set(anchor.id, anchor);
      }
    });
    
    console.log(`🎯 Created ${anchors.length} concept anchors (${mainIdeas.length} main ideas, ${limitedOtherUnits.length} other units) with ${this.config.highlightSensitivity} sensitivity`);
    
    return anchors;
  }

  private createConceptAnchor(unit: ThoughtUnit, fullText: string): ConceptAnchor | null {
    if (!unit.text || unit.text.length < 10) return null;
    
    // Extract key phrases that uniquely identify this concept
    const keyPhrases = this.extractKeyPhrases(unit.text);
    const semanticMarkers = this.extractSemanticMarkers(unit.text);
    const contextWords = this.extractContextWords(unit.text, fullText);
    
    // Create concept fingerprint (unique identifier)
    const conceptFingerprint = this.createConceptFingerprint(unit.text, keyPhrases);
    
    // Create concept hash for fast comparison
    const conceptHash = this.hashConcept(unit.text);
    
    return {
      id: unit.id,
      conceptFingerprint,
      keyPhrases,
      semanticMarkers,
      confidence: unit.confidence,
      type: this.mapThoughtUnitType(unit.type),
      visualCues: unit.visualCues,
      persistentData: {
        originalText: unit.text,
        contextWords,
        conceptHash
      }
    };
  }

  private extractKeyPhrases(text: string): string[] {
    // Extract the most distinctive phrases (3-6 words) that identify this concept
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 15);
    const phrases: string[] = [];
    
    sentences.forEach(sentence => {
      const words = sentence.trim().split(/\s+/);
      
      // Extract noun phrases and key concepts
      for (let i = 0; i <= words.length - 3; i++) {
        const phrase = words.slice(i, i + Math.min(6, words.length - i)).join(' ');
        
        // Only include phrases with meaningful content
        if (this.isSignificantPhrase(phrase)) {
          phrases.push(phrase.toLowerCase());
        }
      }
    });
    
    // Return top 5 most distinctive phrases
    return [...new Set(phrases)].slice(0, 5);
  }

  private extractSemanticMarkers(text: string): string[] {
    const markers: string[] = [];
    
    // Technical terms and proper nouns
    const technicalTerms = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    markers.push(...technicalTerms.slice(0, 3));
    
    // Important keywords
    const keywords = text.match(/\b(?:concept|principle|theory|method|process|system|function|role|purpose|effect|cause|result)\b/gi) || [];
    markers.push(...keywords.slice(0, 2));
    
    // Numbers and measurements
    const numbers = text.match(/\b\d+(?:\.\d+)?(?:\s*%|\s*degrees?|\s*mm|\s*cm|\s*mg|\s*ml)?\b/g) || [];
    markers.push(...numbers.slice(0, 2));
    
    return [...new Set(markers.map(m => m.toLowerCase()))];
  }

  private extractContextWords(text: string, fullText: string): string[] {
    // Find words that commonly appear near this concept in the full text
    const conceptWords = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const contextWords: string[] = [];
    
    conceptWords.forEach(word => {
      const regex = new RegExp(`\\b\\w+\\s+${word}\\s+\\w+\\b`, 'gi');
      const matches = fullText.match(regex) || [];
      
      matches.forEach(match => {
        const words = match.split(/\s+/);
        contextWords.push(...words.filter(w => w !== word && w.length > 3));
      });
    });
    
    return [...new Set(contextWords.slice(0, 10))];
  }

  private createConceptFingerprint(text: string, keyPhrases: string[]): string {
    // Create a unique fingerprint for this concept
    const normalizedText = text.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const firstWords = normalizedText.split(/\s+/).slice(0, 5).join(' ');
    const lastWords = normalizedText.split(/\s+/).slice(-3).join(' ');
    const topPhrase = keyPhrases[0] || '';
    
    return `${firstWords}|${topPhrase}|${lastWords}`.substring(0, 100);
  }

  private hashConcept(text: string): string {
    // Simple hash for fast concept comparison
    let hash = 0;
    const normalized = text.toLowerCase().replace(/[^\w]/g, '');
    
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return hash.toString(36);
  }

  private async applyConceptHighlights(conceptAnchors: ConceptAnchor[], pageText: string): Promise<void> {
    // Find and highlight each concept in the current page
    for (const anchor of conceptAnchors) {
      const highlightElements = await this.findAndHighlightConcept(anchor, pageText);
      if (highlightElements.length > 0) {
        this.activeHighlights.set(anchor.id, highlightElements);
      }
    }
  }

  private async findAndHighlightConcept(anchor: ConceptAnchor, pageText: string): Promise<HTMLElement[]> {
    const highlightElements: HTMLElement[] = [];
    
    // Use multiple strategies to find the concept in the current page
    const matchStrategies = [
      () => this.findByKeyPhrases(anchor),
      () => this.findBySemanticMarkers(anchor),
      () => this.findByConceptFingerprint(anchor),
      () => this.findByFuzzyMatch(anchor)
    ];
    
    for (const strategy of matchStrategies) {
      const elements = strategy();
      if (elements.length > 0) {
        // Apply highlighting to found elements
        elements.forEach(element => {
          this.applyHighlightToElement(element, anchor);
          highlightElements.push(element);
        });
        break; // Use first successful strategy
      }
    }
    
    return highlightElements;
  }

  private findByKeyPhrases(anchor: ConceptAnchor): HTMLElement[] {
    const elements: HTMLElement[] = [];
    
    // Search for key phrases in the current page
    anchor.keyPhrases.forEach(phrase => {
      if (phrase.length < 10) return; // Skip very short phrases
      
      const walker = document.createTreeWalker(
        this.container,
        NodeFilter.SHOW_TEXT,
        null
      );
      
      const textNodes: Text[] = [];
      let node;
      while (node = walker.nextNode()) {
        const textContent = node.textContent?.toLowerCase();
        if (textContent && textContent.includes(phrase)) {
          textNodes.push(node as Text);
        }
      }
      
      // Convert matching text nodes to highlightable elements
      textNodes.forEach(textNode => {
        const element = this.wrapTextNodeForHighlighting(textNode, phrase);
        if (element) elements.push(element);
      });
    });
    
    return elements;
  }

  private findBySemanticMarkers(anchor: ConceptAnchor): HTMLElement[] {
    const elements: HTMLElement[] = [];
    
    // Look for elements containing multiple semantic markers
    const walker = document.createTreeWalker(
      this.container,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    const candidateNodes: { node: Text; score: number }[] = [];
    let node;
    
    while (node = walker.nextNode()) {
      const textContent = (node.textContent || '').toLowerCase();
      let score = 0;
      
      anchor.semanticMarkers.forEach(marker => {
        if (textContent.includes(marker.toLowerCase())) {
          score += 1;
        }
      });
      
      if (score >= 2) { // Require at least 2 semantic markers
        candidateNodes.push({ node: node as Text, score });
      }
    }
    
    // Convert high-scoring nodes to highlightable elements
    candidateNodes
      .sort((a, b) => b.score - a.score)
      .slice(0, 3) // Top 3 matches
      .forEach(({ node }) => {
        const element = this.wrapTextNodeForHighlighting(node, anchor.semanticMarkers[0]);
        if (element) elements.push(element);
      });
    
    return elements;
  }

  private findByConceptFingerprint(anchor: ConceptAnchor): HTMLElement[] {
    // This is a fallback method for finding concepts by their unique fingerprint
    const elements: HTMLElement[] = [];
    
    // Extract sentences from the current page
    const pageText = this.container.textContent || '';
    const sentences = pageText.split(/[.!?]+/).filter(s => s.trim().length > 20);
    
    sentences.forEach(sentence => {
      const sentenceFingerprint = this.createConceptFingerprint(sentence, [sentence.slice(0, 30)]);
      
      // Check for fingerprint similarity
      if (this.fingerprintSimilarity(anchor.conceptFingerprint, sentenceFingerprint) > 0.7) {
        // Find this sentence in the DOM and highlight it
        const element = this.findSentenceInDOM(sentence);
        if (element) elements.push(element);
      }
    });
    
    return elements;
  }

  private findByFuzzyMatch(anchor: ConceptAnchor): HTMLElement[] {
    // Last resort: fuzzy matching based on word overlap
    const elements: HTMLElement[] = [];
    const originalWords = anchor.persistentData.originalText.toLowerCase().split(/\s+/);
    
    const walker = document.createTreeWalker(
      this.container,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          const element = node as Element;
          return element.tagName === 'P' || element.tagName === 'DIV' || element.tagName === 'SPAN'
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        }
      }
    );
    
    let node;
    while (node = walker.nextNode()) {
      const element = node as HTMLElement;
      const elementText = element.textContent?.toLowerCase() || '';
      const elementWords = elementText.split(/\s+/);
      
      // Calculate word overlap
      const overlap = originalWords.filter(word => 
        word.length > 3 && elementWords.some(ew => ew.includes(word) || word.includes(ew))
      ).length;
      
      const overlapRatio = overlap / Math.min(originalWords.length, elementWords.length);
      
      if (overlapRatio > 0.6 && elementText.length > 30) {
        elements.push(element);
      }
    }
    
    return elements.slice(0, 2); // Limit to top 2 fuzzy matches
  }

  private wrapTextNodeForHighlighting(textNode: Text, searchPhrase: string): HTMLElement | null {
    const parent = textNode.parentElement;
    if (!parent) return null;
    
    const text = textNode.textContent || '';
    const lowerText = text.toLowerCase();
    const lowerPhrase = searchPhrase.toLowerCase();
    
    const index = lowerText.indexOf(lowerPhrase);
    if (index === -1) return null;
    
    try {
      // Create a span to wrap the matching text
      const span = document.createElement('span');
      span.className = 'concept-highlight-wrapper';
      
      // Split the text node
      const beforeText = text.substring(0, index);
      const matchText = text.substring(index, index + searchPhrase.length);
      const afterText = text.substring(index + searchPhrase.length);
      
      // Replace the text node with our wrapped version
      if (beforeText) parent.insertBefore(document.createTextNode(beforeText), textNode);
      
      span.textContent = matchText;
      parent.insertBefore(span, textNode);
      
      if (afterText) parent.insertBefore(document.createTextNode(afterText), textNode);
      
      parent.removeChild(textNode);
      
      return span;
    } catch (error) {
      console.warn('Error wrapping text node:', error);
      return null;
    }
  }

  private findSentenceInDOM(sentence: string): HTMLElement | null {
    // Find a sentence in the DOM and return the containing element
    const normalizedSentence = sentence.toLowerCase().trim();
    
    const walker = document.createTreeWalker(
      this.container,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          const element = node as Element;
          const text = element.textContent?.toLowerCase().trim() || '';
          return text.includes(normalizedSentence.substring(0, 50))
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        }
      }
    );
    
    const node = walker.nextNode();
    return node as HTMLElement | null;
  }

  private applyHighlightToElement(element: HTMLElement, anchor: ConceptAnchor): void {
    // Apply concept-based highlighting to an element
    element.classList.add('concept-highlight', anchor.type);
    
    // Set visual properties based on concept type and confidence
    const intensity = Math.min(anchor.confidence * this.getIntensityMultiplier(anchor.type), 0.8);
    element.style.backgroundColor = this.adjustColorIntensity(anchor.visualCues.color, intensity);
    
    // Add tooltip with concept information
    const tooltip = document.createElement('div');
    tooltip.className = 'concept-tooltip';
    tooltip.textContent = `${anchor.type.replace('-', ' ')}: ${Math.round(anchor.confidence * 100)}% confidence`;
    element.appendChild(tooltip);
    
    // Add interaction handlers
    this.addConceptInteractions(element, anchor);
  }

  private addConceptInteractions(element: HTMLElement, anchor: ConceptAnchor): void {
    element.addEventListener('mouseenter', () => {
      element.classList.add('focused');
    });
    
    element.addEventListener('mouseleave', () => {
      element.classList.remove('focused');
    });
    
    element.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onConceptClick(anchor);
    });
  }

  private shouldHighlightConcept(unit: ThoughtUnit): boolean {
    // Apply main idea confidence threshold
    if (unit.isMainIdea && unit.confidence < this.config.mainIdeaConfidenceThreshold) {
      console.log(`❌ Main idea filtered out: confidence ${unit.confidence} < threshold ${this.config.mainIdeaConfidenceThreshold}`);
      return false;
    }
    
    // Apply general confidence threshold based on sensitivity
    const generalThreshold = this.getGeneralConfidenceThreshold();
    if (unit.confidence < generalThreshold) {
      console.log(`❌ Unit filtered out: confidence ${unit.confidence} < general threshold ${generalThreshold}`);
      return false;
    }
    
    // Type-based filtering based on config
    switch (unit.type) {
      case 'topic-sentence':
      case 'conclusion':
        return this.config.showMainIdeas;
      case 'supporting-detail':
      case 'example':
      case 'definition':
        return this.config.showSupportingDetails;
      case 'transition':
        return this.config.showTransitions;
      default:
        return this.config.showSupportingDetails; // Default to supporting details setting
    }
  }

  private getGeneralConfidenceThreshold(): number {
    // Set confidence thresholds based on sensitivity level
    switch (this.config.highlightSensitivity) {
      case 'minimal':
        return 0.8; // Only very high confidence concepts
      case 'moderate':
        return 0.6; // Balanced approach
      case 'detailed':
        return 0.4; // Include more concepts
      default:
        return 0.6;
    }
  }

  private applySensitivityFiltering(units: ThoughtUnit[]): ThoughtUnit[] {
    // Apply additional filtering based on sensitivity level
    switch (this.config.highlightSensitivity) {
      case 'minimal':
        // Only keep the highest confidence units
        return units
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, Math.max(3, Math.floor(units.length * 0.3)));
      
      case 'moderate':
        // Keep a balanced selection
        return units
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, Math.max(5, Math.floor(units.length * 0.6)));
      
      case 'detailed':
        // Keep most units that pass basic filtering
        return units
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, Math.max(8, Math.floor(units.length * 0.9)));
      
      default:
        return units;
    }
  }

  private limitOtherUnitsBySensitivity(otherUnits: ThoughtUnit[]): ThoughtUnit[] {
    // Limit non-main-idea units based on sensitivity
    const maxOtherUnits = this.getMaxOtherUnits();
    return otherUnits
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxOtherUnits);
  }

  private getMaxOtherUnits(): number {
    // Determine max number of non-main-idea units based on sensitivity
    switch (this.config.highlightSensitivity) {
      case 'minimal':
        return 2; // Very few supporting highlights
      case 'moderate':
        return 5; // Balanced number of supporting highlights
      case 'detailed':
        return 10; // More comprehensive highlighting
      default:
        return 5;
    }
  }

  private mapThoughtUnitType(type: ThoughtUnit['type']): ConceptAnchor['type'] {
    switch (type) {
      case 'topic-sentence':
      case 'conclusion':
        return 'main-idea';
      case 'supporting-detail':
        return 'supporting-detail';
      case 'transition':
        return 'transition';
      case 'definition':
        return 'definition';
      case 'example':
        return 'example';
      default:
        return 'supporting-detail';
    }
  }

  private getIntensityMultiplier(type: ConceptAnchor['type']): number {
    switch (type) {
      case 'main-idea': return 1.2;
      case 'definition': return 1.0;
      case 'supporting-detail': return 0.8;
      case 'transition': return 0.6;
      case 'example': return 0.7;
      default: return 0.8;
    }
  }

  private adjustColorIntensity(color: string, intensity: number): string {
    // Convert color to rgba with specified intensity
    if (color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${intensity})`;
    }
    return color;
  }

  private fingerprintSimilarity(fp1: string, fp2: string): number {
    // Calculate similarity between two concept fingerprints
    const parts1 = fp1.split('|');
    const parts2 = fp2.split('|');
    
    let similarity = 0;
    for (let i = 0; i < Math.min(parts1.length, parts2.length); i++) {
      if (parts1[i] === parts2[i]) similarity += 1;
      else if (parts1[i].includes(parts2[i]) || parts2[i].includes(parts1[i])) similarity += 0.5;
    }
    
    return similarity / Math.max(parts1.length, parts2.length);
  }

  private isSignificantPhrase(phrase: string): boolean {
    // Check if a phrase is significant enough to be a key phrase
    const words = phrase.split(/\s+/);
    
    // Must have at least one meaningful word
    const meaningfulWords = words.filter(word => 
      word.length > 3 && 
      !/^(the|and|but|for|are|was|were|been|have|has|had|will|would|could|should)$/i.test(word)
    );
    
    return meaningfulWords.length >= 2 && phrase.length >= 15;
  }

  // Public methods for external control
  public updateConfig(newConfig: Partial<ConceptHighlightConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    // Clear cache if significant config changes occurred
    const significantChanges = [
      'highlightSensitivity',
      'mainIdeaConfidenceThreshold',
      'maxMainIdeasPerPage',
      'showMainIdeas',
      'showSupportingDetails',
      'showTransitions'
    ];
    
    const hasSignificantChanges = significantChanges.some(key => 
      oldConfig[key as keyof ConceptHighlightConfig] !== this.config[key as keyof ConceptHighlightConfig]
    );
    
    if (hasSignificantChanges) {
      console.log('🗑️ Clearing concept cache due to significant config changes');
      this.clearCache();
    }
    
    console.log('🔄 Updated concept highlighting config:', this.config);
  }

  public clearHighlights(): void {
    // Remove all active highlights
    this.activeHighlights.forEach(elements => {
      elements.forEach(element => {
        element.classList.remove('concept-highlight', 'main-idea', 'supporting-detail', 'transition', 'definition', 'example');
        element.style.backgroundColor = '';
        
        // Remove tooltips
        const tooltip = element.querySelector('.concept-tooltip');
        if (tooltip) tooltip.remove();
      });
    });
    
    this.activeHighlights.clear();
    
    // Remove wrapper elements
    const wrappers = this.container.querySelectorAll('.concept-highlight-wrapper');
    wrappers.forEach(wrapper => {
      const parent = wrapper.parentElement;
      if (parent) {
        parent.insertBefore(document.createTextNode(wrapper.textContent || ''), wrapper);
        parent.removeChild(wrapper);
      }
    });
  }

  public getActiveConceptAnchors(): ConceptAnchor[] {
    return Array.from(this.conceptAnchors.values());
  }

  public getMainIdeas(): ConceptAnchor[] {
    return this.getActiveConceptAnchors().filter(anchor => anchor.type === 'main-idea');
  }

  public clearCache(): void {
    this.conceptCache.clear();
    console.log('🗑️ Cleared concept cache');
  }

  // Event handlers (can be overridden)
  protected onConceptClick(anchor: ConceptAnchor): void {
    console.log('Concept clicked:', anchor.type, anchor.conceptFingerprint);
    
    // Emit custom event for external handling
    const event = new CustomEvent('conceptClick', { 
      detail: { anchor },
      bubbles: true 
    });
    this.container.dispatchEvent(event);
  }

  // Cleanup
  public destroy(): void {
    this.clearHighlights();
    this.conceptAnchors.clear();
    this.conceptCache.clear();
    this.activeHighlights.clear();
  }
}

// Utility function for easy integration
export function createConceptAnchoredHighlighter(
  container: HTMLElement, 
  config?: Partial<ConceptHighlightConfig>
): ConceptAnchoredHighlighter {
  return new ConceptAnchoredHighlighter(container, config);
}
