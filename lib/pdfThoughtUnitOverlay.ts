/**
 * PDF Thought Unit Overlay System
 * Enhances PDF viewing with thought unit and main idea highlighting
 * Preserves original PDF layout while adding intelligent visual cues
 */

import { ThoughtUnit, MainIdeaAnalysis, analyzeTextForThoughtUnits } from './thoughtUnitExtraction';

export interface PDFThoughtUnitOverlay {
  id: string;
  element: HTMLElement;
  thoughtUnit: ThoughtUnit;
  isVisible: boolean;
  animationState: 'idle' | 'highlighting' | 'pulsing' | 'fading';
}

export interface OverlayConfig {
  showMainIdeas: boolean;
  showSupportingDetails: boolean;
  showTransitions: boolean;
  animationEnabled: boolean;
  intensityMultiplier: number;
  borderWidth: number;
  pulseOnFocus: boolean;
  // New precision controls
  mainIdeaConfidenceThreshold: number; // Only highlight as main idea if confidence >= this
  highlightSensitivity: 'minimal' | 'moderate' | 'detailed';
  maxMainIdeasPerPage: number;
  sentenceLevelPrecision: boolean;
}

export type ThoughtUnitLevel = 'primary-concept' | 'secondary-concept' | 'supporting-detail' | 'transition' | 'example-evidence';

export class PDFThoughtUnitRenderer {
  private container: HTMLElement;
  private overlays: Map<string, PDFThoughtUnitOverlay> = new Map();
  private config: OverlayConfig;
  private currentFocusedUnit: string | null = null;
  private animationFrameId: number | null = null;

  constructor(container: HTMLElement, config: Partial<OverlayConfig> = {}) {
    this.container = container;
    this.config = {
      showMainIdeas: true,
      showSupportingDetails: true,
      showTransitions: true,
      animationEnabled: true,
      intensityMultiplier: 1.0,
      borderWidth: 2,
      pulseOnFocus: true,
      // New precision controls with optimized defaults
      mainIdeaConfidenceThreshold: 0.85, // Only highlight as main idea if 85%+ confident
      highlightSensitivity: 'moderate',
      maxMainIdeasPerPage: 2, // Maximum 2 main ideas per page
      sentenceLevelPrecision: true,
      ...config
    };
    
    this.initializeStyles();
  }

  private initializeStyles(): void {
    // Inject CSS styles for thought unit overlays
    const styleId = 'thought-unit-overlay-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .thought-unit-overlay {
        position: absolute;
        pointer-events: none;
        border-radius: 4px;
        transition: all 0.3s ease-in-out;
        z-index: 10;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.3);
      }
      
      .thought-unit-overlay.main-idea {
        box-shadow: 0 0 8px rgba(251, 191, 36, 0.6), 0 0 0 2px rgba(251, 191, 36, 0.4);
      }
      
      .thought-unit-overlay.supporting-detail {
        box-shadow: 0 0 4px rgba(96, 165, 250, 0.4), 0 0 0 1px rgba(96, 165, 250, 0.3);
      }
      
      .thought-unit-overlay.transition {
        box-shadow: 0 0 6px rgba(52, 211, 153, 0.5), 0 0 0 1px rgba(52, 211, 153, 0.4);
      }
      
      .thought-unit-overlay.focused {
        transform: scale(1.02);
        z-index: 20;
      }
      
      .thought-unit-overlay.pulsing {
        animation: thoughtUnitPulse 2s ease-in-out infinite;
      }
      
      .thought-unit-overlay.highlighting {
        animation: thoughtUnitHighlight 1s ease-out;
      }
      
      @keyframes thoughtUnitPulse {
        0%, 100% { opacity: 0.6; transform: scale(1); }
        50% { opacity: 0.9; transform: scale(1.01); }
      }
      
      @keyframes thoughtUnitHighlight {
        0% { opacity: 0; transform: scale(0.95); }
        50% { opacity: 1; transform: scale(1.05); }
        100% { opacity: 0.8; transform: scale(1); }
      }
      
      .thought-unit-tooltip {
        position: absolute;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        max-width: 300px;
        z-index: 30;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease-in-out;
        backdrop-filter: blur(4px);
      }
      
      .thought-unit-tooltip.visible {
        opacity: 1;
      }
      
      .thought-unit-boundary {
        position: absolute;
        height: 2px;
        background: linear-gradient(90deg, transparent, rgba(251, 191, 36, 0.6), transparent);
        pointer-events: none;
        z-index: 5;
        opacity: 0.7;
      }
      
      .thought-unit-boundary.soft {
        background: linear-gradient(90deg, transparent, rgba(167, 139, 250, 0.4), transparent);
        height: 1px;
      }
      
      .thought-unit-boundary.transition {
        background: linear-gradient(90deg, transparent, rgba(52, 211, 153, 0.5), transparent);
        height: 1px;
      }
    `;
    
    document.head.appendChild(style);
  }

  // Main method to analyze and render thought units on PDF
  public async renderThoughtUnits(pageText: string, pageNumber: number): Promise<void> {
    try {
      // Clear existing overlays for this page
      this.clearOverlays();
      
      // Analyze text for thought units
      const analysis = analyzeTextForThoughtUnits(pageText, pageNumber);
      
      // Render thought unit overlays
      await this.createThoughtUnitOverlays(analysis.thoughtUnits, pageText);
      
      // Render thought unit boundaries
      this.createBoundaryIndicators(analysis.boundaries, pageText);
      
      // Add main idea emphasis
      this.emphasizeMainIdeas(analysis.mainIdeaAnalysis, analysis.thoughtUnits);
      
      console.log(`🧠 Rendered ${analysis.thoughtUnits.length} thought units on page ${pageNumber}`);
      
    } catch (error) {
      console.error('Error rendering thought units:', error);
    }
  }

  private async createThoughtUnitOverlays(thoughtUnits: ThoughtUnit[], fullText: string): Promise<void> {
    // Apply precision filtering based on config
    const filteredUnits = this.applyPrecisionFiltering(thoughtUnits);
    
    for (const unit of filteredUnits) {
      if (!this.shouldShowUnit(unit)) continue;
      
      const textNodes = this.findTextNodesForUnit(unit, fullText);
      if (textNodes.length === 0) {
        console.log(`⚠️ No text nodes found for thought unit: ${unit.id}`);
        continue;
      }
      
      // Validate that text nodes have actual content and are visible
      const validTextNodes = this.validateTextNodes(textNodes);
      if (validTextNodes.length === 0) {
        console.log(`⚠️ No valid text nodes for thought unit: ${unit.id}`);
        continue;
      }
      
      const overlay = this.createOverlayElement(unit, validTextNodes);
      if (overlay && this.validateOverlayDimensions(overlay)) {
        this.overlays.set(unit.id, {
          id: unit.id,
          element: overlay,
          thoughtUnit: unit,
          isVisible: true,
          animationState: 'idle'
        });
        
        this.container.appendChild(overlay);
        
        // Animate in if enabled
        if (this.config.animationEnabled) {
          this.animateOverlayIn(unit.id);
        }
        
        console.log(`✅ Created overlay for thought unit: ${unit.id} (${unit.type})`);
      } else {
        console.log(`❌ Failed to create valid overlay for thought unit: ${unit.id}`);
      }
    }
  }

  private shouldShowUnit(unit: ThoughtUnit): boolean {
    // First check type-based visibility
    let typeVisible = false;
    switch (unit.type) {
      case 'topic-sentence':
        typeVisible = this.config.showMainIdeas;
        break;
      case 'supporting-detail':
      case 'example':
      case 'definition':
        typeVisible = this.config.showSupportingDetails;
        break;
      case 'transition':
        typeVisible = this.config.showTransitions;
        break;
      case 'conclusion':
        typeVisible = this.config.showMainIdeas;
        break;
      default:
        typeVisible = true;
    }
    
    if (!typeVisible) return false;
    
    // Apply confidence threshold for main ideas
    if (unit.isMainIdea && unit.confidence < this.config.mainIdeaConfidenceThreshold) {
      console.log(`🎯 Main idea filtered out due to low confidence: ${unit.confidence} < ${this.config.mainIdeaConfidenceThreshold}`);
      return false;
    }
    
    // Apply sensitivity filtering
    switch (this.config.highlightSensitivity) {
      case 'minimal':
        return unit.isMainIdea && unit.confidence >= 0.8;
      case 'moderate':
        return unit.confidence >= 0.6;
      case 'detailed':
        return unit.confidence >= 0.4;
      default:
        return true;
    }
  }

  private findTextNodesForUnit(unit: ThoughtUnit, fullText: string): Text[] {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      this.container,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    const searchText = unit.text.trim();
    if (searchText.length < 10) return textNodes; // Skip very short units
    
    // Enhanced search patterns for better precision
    const searchPatterns = this.createEnhancedSearchPatterns(searchText);
    
    // Collect all text nodes first
    const allTextNodes: Text[] = [];
    let node;
    while (node = walker.nextNode()) {
      const textNode = node as Text;
      if (textNode.textContent && textNode.textContent.trim().length > 0) {
        allTextNodes.push(textNode);
      }
    }
    
    // Try sentence-level precision first if enabled
    if (this.config.sentenceLevelPrecision) {
      const sentenceNodes = this.findSentenceLevelMatches(searchText, allTextNodes);
      if (sentenceNodes.length > 0) {
        return sentenceNodes;
      }
    }
    
    // Fallback to phrase-level matching
    for (const textNode of allTextNodes) {
      const nodeText = textNode.textContent || '';
      
      // Check if this text node contains part of our thought unit
      for (const pattern of searchPatterns) {
        if (pattern.length > 10 && this.enhancedTextMatch(nodeText, pattern)) {
          textNodes.push(textNode);
          break;
        }
      }
    }
    
    return textNodes;
  }

  private createEnhancedSearchPatterns(searchText: string): string[] {
    const patterns: string[] = [];
    
    // Original text
    patterns.push(searchText);
    
    // Normalized whitespace
    patterns.push(searchText.replace(/\s+/g, ' '));
    
    // Split into sentences for sentence-level matching
    const sentences = searchText.split(/[.!?]+/).filter(s => s.trim().length > 15);
    patterns.push(...sentences.map(s => s.trim()));
    
    // Extract key phrases (4-6 word chunks)
    const words = searchText.split(/\s+/);
    for (let i = 0; i <= words.length - 4; i++) {
      const phrase = words.slice(i, i + Math.min(6, words.length - i)).join(' ');
      if (phrase.length > 20) {
        patterns.push(phrase);
      }
    }
    
    // Extract meaningful substrings (first/last parts)
    if (searchText.length > 50) {
      patterns.push(searchText.slice(0, 50));
      patterns.push(searchText.slice(-50));
    }
    
    return patterns.filter((p, i, arr) => arr.indexOf(p) === i); // Remove duplicates
  }

  private findSentenceLevelMatches(searchText: string, textNodes: Text[]): Text[] {
    const matchingNodes: Text[] = [];
    const sentences = searchText.split(/[.!?]+/).filter(s => s.trim().length > 15);
    
    for (const sentence of sentences) {
      const sentenceWords = sentence.trim().toLowerCase().split(/\s+/);
      if (sentenceWords.length < 4) continue; // Skip very short sentences
      
      for (const textNode of textNodes) {
        const nodeText = (textNode.textContent || '').toLowerCase();
        
        // Check if this node contains most words from the sentence
        const matchingWords = sentenceWords.filter(word => 
          word.length > 3 && nodeText.includes(word)
        );
        
        const matchRatio = matchingWords.length / sentenceWords.length;
        if (matchRatio >= 0.6) { // 60% of words must match
          matchingNodes.push(textNode);
        }
      }
    }
    
    return matchingNodes;
  }

  private enhancedTextMatch(nodeText: string, searchText: string): boolean {
    const normalizeText = (text: string) => 
      text.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '').trim();
    
    const normalizedNode = normalizeText(nodeText);
    const normalizedSearch = normalizeText(searchText);
    
    // Exact match (highest priority)
    if (normalizedNode.includes(normalizedSearch)) return true;
    
    // Partial sentence match
    if (normalizedSearch.length > 30) {
      const searchStart = normalizedSearch.slice(0, 30);
      const searchEnd = normalizedSearch.slice(-30);
      
      if (normalizedNode.includes(searchStart) || normalizedNode.includes(searchEnd)) {
        return true;
      }
    }
    
    // Word-based fuzzy match (improved threshold)
    const searchWords = normalizedSearch.split(/\s+/).filter(w => w.length > 3);
    const nodeWords = normalizedNode.split(/\s+/);
    
    if (searchWords.length === 0) return false;
    
    const matchingWords = searchWords.filter(word => 
      nodeWords.some(nodeWord => 
        nodeWord.includes(word) || word.includes(nodeWord) || 
        this.levenshteinDistance(word, nodeWord) <= 2
      )
    );
    
    const matchRatio = matchingWords.length / searchWords.length;
    return matchRatio >= 0.75; // Increased threshold for better precision
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private extractKeyPhrases(text: string): string[] {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 15);
    const phrases: string[] = [];
    
    sentences.forEach(sentence => {
      const words = sentence.trim().split(/\s+/);
      if (words.length >= 4) {
        // Extract 4-word phrases
        for (let i = 0; i <= words.length - 4; i++) {
          phrases.push(words.slice(i, i + 4).join(' '));
        }
      }
    });
    
    return phrases.slice(0, 3); // Return top 3 phrases
  }

  private fuzzyTextMatch(nodeText: string, searchText: string): boolean {
    const normalizeText = (text: string) => 
      text.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '').trim();
    
    const normalizedNode = normalizeText(nodeText);
    const normalizedSearch = normalizeText(searchText);
    
    // Exact match
    if (normalizedNode.includes(normalizedSearch)) return true;
    
    // Fuzzy match - check if most words are present
    const searchWords = normalizedSearch.split(/\s+/);
    const nodeWords = normalizedNode.split(/\s+/);
    
    const matchingWords = searchWords.filter(word => 
      nodeWords.some(nodeWord => 
        nodeWord.includes(word) || word.includes(nodeWord)
      )
    );
    
    return matchingWords.length >= Math.ceil(searchWords.length * 0.7); // 70% word match
  }

  private createOverlayElement(unit: ThoughtUnit, textNodes: Text[]): HTMLElement | null {
    if (textNodes.length === 0) return null;
    
    // Calculate bounding box for all text nodes
    const rects: DOMRect[] = [];
    
    textNodes.forEach(textNode => {
      try {
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const nodeRects = Array.from(range.getClientRects());
        rects.push(...nodeRects);
      } catch (error) {
        // Ignore range errors
      }
    });
    
    if (rects.length === 0) return null;
    
    // Find the overall bounding box
    const containerRect = this.container.getBoundingClientRect();
    const minLeft = Math.min(...rects.map(r => r.left));
    const maxRight = Math.max(...rects.map(r => r.right));
    const minTop = Math.min(...rects.map(r => r.top));
    const maxBottom = Math.max(...rects.map(r => r.bottom));
    
    // Create overlay element
    const overlay = document.createElement('div');
    overlay.className = `thought-unit-overlay ${unit.type} ${unit.isMainIdea ? 'main-idea' : ''}`;
    overlay.id = `overlay-${unit.id}`;
    
    // Position the overlay
    overlay.style.cssText = `
      left: ${minLeft - containerRect.left + this.container.scrollLeft - 4}px;
      top: ${minTop - containerRect.top + this.container.scrollTop - 2}px;
      width: ${maxRight - minLeft + 8}px;
      height: ${maxBottom - minTop + 4}px;
      background-color: ${unit.visualCues.color}${Math.round(unit.visualCues.intensity * this.config.intensityMultiplier * 255).toString(16).padStart(2, '0')};
      border: ${this.config.borderWidth}px ${unit.visualCues.borderStyle} ${unit.visualCues.color};
      opacity: ${unit.confidence * 0.8};
    `;
    
    // Add interaction handlers
    this.addOverlayInteractions(overlay, unit);
    
    return overlay;
  }

  private addOverlayInteractions(overlay: HTMLElement, unit: ThoughtUnit): void {
    let tooltip: HTMLElement | null = null;
    
    // Mouse enter - show tooltip and focus
    overlay.addEventListener('mouseenter', () => {
      this.focusThoughtUnit(unit.id);
      tooltip = this.createTooltip(unit);
      if (tooltip) {
        this.container.appendChild(tooltip);
        this.positionTooltip(tooltip, overlay);
      }
    });
    
    // Mouse leave - hide tooltip and unfocus
    overlay.addEventListener('mouseleave', () => {
      this.unfocusThoughtUnit(unit.id);
      if (tooltip) {
        tooltip.remove();
        tooltip = null;
      }
    });
    
    // Click - emit event for external handling
    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onThoughtUnitClick(unit);
    });
  }

  private createTooltip(unit: ThoughtUnit): HTMLElement {
    const tooltip = document.createElement('div');
    tooltip.className = 'thought-unit-tooltip';
    
    const typeLabel = unit.type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
    const confidencePercent = Math.round(unit.confidence * 100);
    
    tooltip.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px;">
        ${unit.isMainIdea ? '💡 Main Idea' : `📝 ${typeLabel}`}
        <span style="float: right; opacity: 0.7;">${confidencePercent}%</span>
      </div>
      <div style="font-size: 11px; opacity: 0.9; margin-bottom: 4px;">
        ${unit.text.slice(0, 120)}${unit.text.length > 120 ? '...' : ''}
      </div>
      ${unit.cognitiveMarkers.memoryAnchor ? `
        <div style="font-size: 10px; opacity: 0.7; font-style: italic;">
          💭 ${unit.cognitiveMarkers.memoryAnchor}
        </div>
      ` : ''}
      <div style="font-size: 10px; opacity: 0.6; margin-top: 4px;">
        ⏱️ ${Math.round(unit.cognitiveMarkers.processingTime)}s • ${unit.cognitiveMarkers.complexity}
      </div>
    `;
    
    // Show tooltip after a brief delay
    setTimeout(() => {
      tooltip.classList.add('visible');
    }, 100);
    
    return tooltip;
  }

  private positionTooltip(tooltip: HTMLElement, overlay: HTMLElement): void {
    const overlayRect = overlay.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    // Position above the overlay by default
    let left = overlayRect.left - containerRect.left + this.container.scrollLeft;
    let top = overlayRect.top - containerRect.top + this.container.scrollTop - tooltipRect.height - 8;
    
    // Adjust if tooltip would go off-screen
    if (top < 0) {
      top = overlayRect.bottom - containerRect.top + this.container.scrollTop + 8;
    }
    
    if (left + tooltipRect.width > this.container.clientWidth) {
      left = this.container.clientWidth - tooltipRect.width - 8;
    }
    
    if (left < 0) left = 8;
    
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  private createBoundaryIndicators(boundaries: any[], fullText: string): void {
    boundaries.forEach((boundary, index) => {
      const indicator = document.createElement('div');
      indicator.className = `thought-unit-boundary ${boundary.type}`;
      indicator.id = `boundary-${index}`;
      
      // Find approximate position in the rendered text
      const textBefore = fullText.slice(0, boundary.position);
      const textNodes = this.findTextNodesForText(textBefore);
      
      if (textNodes.length > 0) {
        const lastNode = textNodes[textNodes.length - 1];
        try {
          const range = document.createRange();
          range.setStart(lastNode, Math.min(lastNode.textContent?.length || 0, 10));
          range.setEnd(lastNode, lastNode.textContent?.length || 0);
          
          const rect = range.getBoundingClientRect();
          const containerRect = this.container.getBoundingClientRect();
          
          indicator.style.cssText = `
            left: ${rect.left - containerRect.left + this.container.scrollLeft}px;
            top: ${rect.bottom - containerRect.top + this.container.scrollTop + 2}px;
            width: ${Math.min(200, rect.width)}px;
          `;
          
          this.container.appendChild(indicator);
        } catch (error) {
          // Ignore positioning errors
        }
      }
    });
  }

  private findTextNodesForText(searchText: string): Text[] {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      this.container,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    const normalizedSearch = searchText.toLowerCase().replace(/\s+/g, ' ').trim();
    if (normalizedSearch.length < 20) return textNodes;
    
    let node;
    while (node = walker.nextNode()) {
      const textNode = node as Text;
      const nodeText = (textNode.textContent || '').toLowerCase().replace(/\s+/g, ' ');
      
      if (nodeText.length > 10 && normalizedSearch.includes(nodeText.slice(0, 30))) {
        textNodes.push(textNode);
      }
    }
    
    return textNodes;
  }

  private emphasizeMainIdeas(mainIdeaAnalysis: MainIdeaAnalysis, thoughtUnits: ThoughtUnit[]): void {
    const mainIdeaUnits = thoughtUnits.filter(unit => unit.isMainIdea);
    
    mainIdeaUnits.forEach(unit => {
      const overlay = this.overlays.get(unit.id);
      if (overlay) {
        // Add extra emphasis to main ideas
        overlay.element.style.boxShadow = `
          0 0 12px rgba(251, 191, 36, 0.8),
          0 0 0 3px rgba(251, 191, 36, 0.5),
          inset 0 0 20px rgba(251, 191, 36, 0.1)
        `;
        overlay.element.style.zIndex = '15';
        
        // Add pulsing animation for main ideas
        if (this.config.animationEnabled) {
          overlay.element.classList.add('pulsing');
        }
      }
    });
  }

  private focusThoughtUnit(unitId: string): void {
    if (this.currentFocusedUnit === unitId) return;
    
    // Unfocus previous unit
    if (this.currentFocusedUnit) {
      this.unfocusThoughtUnit(this.currentFocusedUnit);
    }
    
    const overlay = this.overlays.get(unitId);
    if (overlay) {
      overlay.element.classList.add('focused');
      overlay.animationState = 'highlighting';
      
      if (this.config.pulseOnFocus) {
        overlay.element.classList.add('pulsing');
      }
      
      this.currentFocusedUnit = unitId;
      
      // Emit focus event
      this.onThoughtUnitFocus(overlay.thoughtUnit);
    }
  }

  private unfocusThoughtUnit(unitId: string): void {
    const overlay = this.overlays.get(unitId);
    if (overlay) {
      overlay.element.classList.remove('focused', 'pulsing');
      overlay.animationState = 'idle';
    }
    
    if (this.currentFocusedUnit === unitId) {
      this.currentFocusedUnit = null;
    }
  }

  private animateOverlayIn(unitId: string): void {
    const overlay = this.overlays.get(unitId);
    if (overlay) {
      overlay.element.classList.add('highlighting');
      overlay.animationState = 'highlighting';
      
      setTimeout(() => {
        overlay.element.classList.remove('highlighting');
        overlay.animationState = 'idle';
      }, 1000);
    }
  }

  // Public methods for external control
  public updateConfig(newConfig: Partial<OverlayConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    // Check if we need full re-analysis vs just refresh
    const needsReanalysis = this.configRequiresReanalysis(oldConfig, this.config);
    
    if (needsReanalysis) {
      console.log('🔄 Config change requires full re-analysis');
      // Don't re-analyze here - let the caller handle it
      // This prevents infinite loops and gives better control
    } else {
      console.log('🔄 Config change only requires overlay refresh');
      this.refreshOverlays();
    }
  }

  // Check if config changes require full re-analysis
  private configRequiresReanalysis(oldConfig: OverlayConfig, newConfig: OverlayConfig): boolean {
    // These changes require re-analyzing the text with new thresholds
    return (
      oldConfig.highlightSensitivity !== newConfig.highlightSensitivity ||
      oldConfig.mainIdeaConfidenceThreshold !== newConfig.mainIdeaConfidenceThreshold ||
      oldConfig.maxMainIdeasPerPage !== newConfig.maxMainIdeasPerPage ||
      oldConfig.sentenceLevelPrecision !== newConfig.sentenceLevelPrecision
    );
  }

  // New method to check if re-analysis is needed
  public needsReanalysis(newConfig: Partial<OverlayConfig>): boolean {
    const tempConfig = { ...this.config, ...newConfig };
    return this.configRequiresReanalysis(this.config, tempConfig);
  }

  public clearOverlays(): void {
    this.overlays.forEach(overlay => {
      overlay.element.remove();
    });
    this.overlays.clear();
    
    // Remove boundary indicators
    const boundaries = this.container.querySelectorAll('.thought-unit-boundary');
    boundaries.forEach(boundary => boundary.remove());
    
    // Remove tooltips
    const tooltips = this.container.querySelectorAll('.thought-unit-tooltip');
    tooltips.forEach(tooltip => tooltip.remove());
  }

  public highlightThoughtUnit(unitId: string): void {
    const overlay = this.overlays.get(unitId);
    if (overlay && this.config.animationEnabled) {
      overlay.element.classList.add('highlighting');
      overlay.animationState = 'highlighting';
      
      setTimeout(() => {
        overlay.element.classList.remove('highlighting');
        overlay.animationState = 'idle';
      }, 1000);
    }
  }

  public getThoughtUnits(): ThoughtUnit[] {
    return Array.from(this.overlays.values()).map(overlay => overlay.thoughtUnit);
  }

  public getMainIdeas(): ThoughtUnit[] {
    return this.getThoughtUnits().filter(unit => unit.isMainIdea);
  }

  private applyPrecisionFiltering(thoughtUnits: ThoughtUnit[]): ThoughtUnit[] {
    // Apply maxMainIdeasPerPage limit
    const mainIdeas = thoughtUnits.filter(unit => unit.isMainIdea)
      .sort((a, b) => b.confidence - a.confidence) // Sort by confidence descending
      .slice(0, this.config.maxMainIdeasPerPage);
    
    const nonMainIdeas = thoughtUnits.filter(unit => !unit.isMainIdea);
    
    // Combine and return filtered units
    const filteredUnits = [...mainIdeas, ...nonMainIdeas];
    
    console.log(`🎯 Precision filtering: ${thoughtUnits.length} → ${filteredUnits.length} units (${mainIdeas.length} main ideas)`);
    
    return filteredUnits;
  }

  private validateTextNodes(textNodes: Text[]): Text[] {
    return textNodes.filter(textNode => {
      // Check if text node has actual content
      const content = textNode.textContent?.trim();
      if (!content || content.length < 5) return false;
      
      // Check if text node is visible (has a parent element that's rendered)
      const parentElement = textNode.parentElement;
      if (!parentElement) return false;
      
      // Check if parent element is visible
      const style = window.getComputedStyle(parentElement);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      
      // Check if parent element has dimensions
      const rect = parentElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      
      return true;
    });
  }

  private validateOverlayDimensions(overlay: HTMLElement): boolean {
    const rect = overlay.getBoundingClientRect();
    
    // Check if overlay has valid dimensions
    if (rect.width <= 0 || rect.height <= 0) {
      console.log(`❌ Invalid overlay dimensions: ${rect.width}x${rect.height}`);
      return false;
    }
    
    // Check if overlay is too small to be meaningful
    if (rect.width < 10 || rect.height < 5) {
      console.log(`❌ Overlay too small: ${rect.width}x${rect.height}`);
      return false;
    }
    
    // Check if overlay is unreasonably large (likely an error)
    if (rect.width > 2000 || rect.height > 1000) {
      console.log(`❌ Overlay too large: ${rect.width}x${rect.height}`);
      return false;
    }
    
    return true;
  }

  private refreshOverlays(): void {
    this.overlays.forEach(overlay => {
      const unit = overlay.thoughtUnit;
      
      // Update visibility based on config
      const shouldShow = this.shouldShowUnit(unit);
      overlay.element.style.display = shouldShow ? 'block' : 'none';
      overlay.isVisible = shouldShow;
      
      // Update styling based on config
      overlay.element.style.borderWidth = `${this.config.borderWidth}px`;
      
      const intensity = unit.visualCues.intensity * this.config.intensityMultiplier;
      const alpha = Math.round(intensity * 255).toString(16).padStart(2, '0');
      overlay.element.style.backgroundColor = `${unit.visualCues.color}${alpha}`;
    });
  }

  // Event handlers (can be overridden)
  protected onThoughtUnitClick(unit: ThoughtUnit): void {
    console.log('Thought unit clicked:', unit.id, unit.type);
    // Emit custom event for external handling
    const event = new CustomEvent('thoughtUnitClick', { 
      detail: { unit },
      bubbles: true 
    });
    this.container.dispatchEvent(event);
  }

  protected onThoughtUnitFocus(unit: ThoughtUnit): void {
    console.log('Thought unit focused:', unit.id, unit.type);
    // Emit custom event for external handling
    const event = new CustomEvent('thoughtUnitFocus', { 
      detail: { unit },
      bubbles: true 
    });
    this.container.dispatchEvent(event);
  }

  // Cleanup
  public destroy(): void {
    this.clearOverlays();
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    // Remove event listeners
    this.container.removeEventListener('thoughtUnitClick', this.onThoughtUnitClick as any);
    this.container.removeEventListener('thoughtUnitFocus', this.onThoughtUnitFocus as any);
  }
}

// Utility function for easy integration
export function createThoughtUnitRenderer(
  container: HTMLElement, 
  config?: Partial<OverlayConfig>
): PDFThoughtUnitRenderer {
  return new PDFThoughtUnitRenderer(container, config);
}

// Export types for external use
export type { ThoughtUnit, MainIdeaAnalysis } from './thoughtUnitExtraction';
