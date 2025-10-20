/**
 * Embedded Butler Overlay System
 * Anchors Butler content directly within the PDF text layer
 * Maintains persistence across navigation and scrolling
 */

import { type ButlerInsightSummary, type SmartTOCEntry } from './tocParser';

export interface ButlerOverlayAnchor {
  id: string;
  pageNumber: number;
  textRange?: { start: number; end: number };
  boundingRect: DOMRect;
  element?: HTMLElement;
  content: ButlerInsightSummary;
  isVisible: boolean;
  isPinned: boolean;
  zIndex: number;
}

export interface OverlayConfig {
  maxVisibleOverlays: number;
  autoHideDelay: number;       // ms before overlay auto-hides
  fadeDuration: number;        // ms fade animation
  anchorDistance: number;      // px from anchor point
  zIndexBase: number;
  enablePersistence: boolean;
  enableAutoPositioning: boolean;
  collisionDetection: boolean;
}

export interface OverlayState {
  anchors: Map<string, ButlerOverlayAnchor>;
  activeOverlays: Set<string>;
  pinnedOverlays: Set<string>;
  currentPage: number;
  scrollOffset: { x: number; y: number };
  viewportRect: DOMRect;
}

/**
 * Embedded Butler Overlay Manager
 * Handles positioning, visibility, and lifecycle of Butler overlays in PDF
 */
export class EmbeddedButlerOverlay {
  private config: OverlayConfig;
  private state: OverlayState;
  private overlayContainer?: HTMLElement;
  private pdfContainer?: HTMLElement;
  private observer?: IntersectionObserver;
  private resizeObserver?: ResizeObserver;
  private stateChangeCallbacks: Set<(state: OverlayState) => void> = new Set();

  constructor(config: Partial<OverlayConfig> = {}) {
    this.config = {
      maxVisibleOverlays: 8,
      autoHideDelay: 5000,
      fadeDuration: 300,
      anchorDistance: 20,
      zIndexBase: 1000,
      enablePersistence: true,
      enableAutoPositioning: true,
      collisionDetection: true,
      ...config
    };

    this.state = {
      anchors: new Map(),
      activeOverlays: new Set(),
      pinnedOverlays: new Set(),
      currentPage: 1,
      scrollOffset: { x: 0, y: 0 },
      viewportRect: new DOMRect()
    };

    console.log('🧠 Embedded Butler Overlay initialized:', this.config);
  }

  /**
   * Initialize overlay system with PDF container
   */
  public initialize(pdfContainer: HTMLElement): void {
    console.log('🧠 Initializing embedded Butler overlay system');
    
    this.pdfContainer = pdfContainer;
    this.setupOverlayContainer();
    this.setupObservers();
    this.bindEventListeners();
    
    // Initial viewport calculation
    this.updateViewport();
  }

  /**
   * Add Butler insights as anchored overlays
   */
  public addButlerInsights(
    insights: ButlerInsightSummary[], 
    pageNumber: number,
    textElements?: HTMLElement[]
  ): void {
    console.log('🧠 Adding Butler insights as overlays:', insights.length, 'insights for page', pageNumber);

    insights.forEach((insight, index) => {
      const anchorId = `butler-${pageNumber}-${index}`;
      
      // Find anchor element (if textElements provided)
      const anchorElement = textElements?.[index] || this.findAnchorElement(insight, pageNumber);
      
      if (anchorElement) {
        const boundingRect = anchorElement.getBoundingClientRect();
        
        const anchor: ButlerOverlayAnchor = {
          id: anchorId,
          pageNumber,
          textRange: insight.anchors.textRange,
          boundingRect,
          element: anchorElement,
          content: insight,
          isVisible: false,
          isPinned: false,
          zIndex: this.config.zIndexBase + this.state.anchors.size
        };

        this.state.anchors.set(anchorId, anchor);
        this.createOverlayElement(anchor);
        
        // Auto-show if on current page
        if (pageNumber === this.state.currentPage) {
          this.showOverlay(anchorId);
        }
      }
    });

    this.notifyStateChange();
  }

  /**
   * Update current page and show relevant overlays
   */
  public setCurrentPage(pageNumber: number): void {
    if (this.state.currentPage === pageNumber) return;
    
    console.log('🧠 Butler overlay page change:', this.state.currentPage, '->', pageNumber);
    
    const oldPage = this.state.currentPage;
    this.state.currentPage = pageNumber;
    
    // Hide overlays from old page (except pinned ones)
    this.state.anchors.forEach((anchor, id) => {
      if (anchor.pageNumber === oldPage && !anchor.isPinned) {
        this.hideOverlay(id);
      }
    });
    
    // Show overlays for new page
    this.state.anchors.forEach((anchor, id) => {
      if (anchor.pageNumber === pageNumber) {
        this.showOverlay(id);
      }
    });
    
    this.updateOverlayPositions();
    this.notifyStateChange();
  }

  /**
   * Show specific overlay
   */
  public showOverlay(anchorId: string): void {
    const anchor = this.state.anchors.get(anchorId);
    if (!anchor || anchor.isVisible) return;

    // Respect max visible overlays limit
    if (this.state.activeOverlays.size >= this.config.maxVisibleOverlays) {
      this.hideOldestOverlay();
    }

    anchor.isVisible = true;
    this.state.activeOverlays.add(anchorId);
    
    const overlayElement = document.getElementById(`overlay-${anchorId}`);
    if (overlayElement) {
      overlayElement.style.display = 'block';
      overlayElement.style.opacity = '0';
      
      // Animate in
      requestAnimationFrame(() => {
        overlayElement.style.transition = `opacity ${this.config.fadeDuration}ms ease`;
        overlayElement.style.opacity = '1';
      });
      
      // Auto-hide timer (unless pinned)
      if (!anchor.isPinned && this.config.autoHideDelay > 0) {
        setTimeout(() => {
          if (!anchor.isPinned) {
            this.hideOverlay(anchorId);
          }
        }, this.config.autoHideDelay);
      }
    }

    this.updateOverlayPosition(anchorId);
  }

  /**
   * Hide specific overlay
   */
  public hideOverlay(anchorId: string): void {
    const anchor = this.state.anchors.get(anchorId);
    if (!anchor || !anchor.isVisible) return;

    anchor.isVisible = false;
    this.state.activeOverlays.delete(anchorId);
    
    const overlayElement = document.getElementById(`overlay-${anchorId}`);
    if (overlayElement) {
      overlayElement.style.transition = `opacity ${this.config.fadeDuration}ms ease`;
      overlayElement.style.opacity = '0';
      
      setTimeout(() => {
        if (!anchor.isVisible) { // Double check in case it was shown again
          overlayElement.style.display = 'none';
        }
      }, this.config.fadeDuration);
    }
  }

  /**
   * Pin/unpin overlay to prevent auto-hiding
   */
  public togglePin(anchorId: string): void {
    const anchor = this.state.anchors.get(anchorId);
    if (!anchor) return;

    anchor.isPinned = !anchor.isPinned;
    
    if (anchor.isPinned) {
      this.state.pinnedOverlays.add(anchorId);
    } else {
      this.state.pinnedOverlays.delete(anchorId);
    }

    // Update pin visual indicator
    const overlayElement = document.getElementById(`overlay-${anchorId}`);
    const pinButton = overlayElement?.querySelector('[data-pin-button]');
    if (pinButton) {
      pinButton.textContent = anchor.isPinned ? '📌' : '📍';
      pinButton.setAttribute('title', anchor.isPinned ? 'Unpin overlay' : 'Pin overlay');
    }

    this.notifyStateChange();
  }

  /**
   * Clear all overlays (optionally preserve pinned ones)
   */
  public clearOverlays(preservePinned: boolean = true): void {
    console.log('🧠 Clearing Butler overlays, preserve pinned:', preservePinned);

    this.state.anchors.forEach((anchor, id) => {
      if (!preservePinned || !anchor.isPinned) {
        this.hideOverlay(id);
        this.state.anchors.delete(id);
        
        // Remove DOM element
        const overlayElement = document.getElementById(`overlay-${id}`);
        overlayElement?.remove();
      }
    });

    if (!preservePinned) {
      this.state.pinnedOverlays.clear();
    }

    this.notifyStateChange();
  }

  /**
   * Update overlay positions (called on scroll/resize)
   */
  public updateOverlayPositions(): void {
    this.state.anchors.forEach((anchor, id) => {
      if (anchor.isVisible) {
        this.updateOverlayPosition(id);
      }
    });
  }

  /**
   * Get current overlay state
   */
  public getState(): OverlayState {
    return { ...this.state };
  }

  /**
   * Subscribe to state changes
   */
  public onStateChange(callback: (state: OverlayState) => void): void {
    this.stateChangeCallbacks.add(callback);
  }

  /**
   * Unsubscribe from state changes
   */
  public offStateChange(callback: (state: OverlayState) => void): void {
    this.stateChangeCallbacks.delete(callback);
  }

  /**
   * Cleanup overlay system
   */
  public destroy(): void {
    console.log('🧠 Destroying embedded Butler overlay system');
    
    this.observer?.disconnect();
    this.resizeObserver?.disconnect();
    this.clearOverlays(false);
    this.overlayContainer?.remove();
    this.stateChangeCallbacks.clear();
  }

  // Private methods

  private setupOverlayContainer(): void {
    if (!this.pdfContainer) return;

    this.overlayContainer = document.createElement('div');
    this.overlayContainer.id = 'butler-overlay-container';
    this.overlayContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: ${this.config.zIndexBase};
    `;

    this.pdfContainer.appendChild(this.overlayContainer);
  }

  private setupObservers(): void {
    if (!this.pdfContainer) return;

    // Intersection observer for visibility
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const anchorId = entry.target.getAttribute('data-anchor-id');
        if (anchorId) {
          if (entry.isIntersecting) {
            this.showOverlay(anchorId);
          } else {
            const anchor = this.state.anchors.get(anchorId);
            if (anchor && !anchor.isPinned) {
              this.hideOverlay(anchorId);
            }
          }
        }
      });
    }, {
      root: this.pdfContainer,
      threshold: 0.1
    });

    // Resize observer for position updates
    this.resizeObserver = new ResizeObserver(() => {
      this.updateViewport();
      this.updateOverlayPositions();
    });

    this.resizeObserver.observe(this.pdfContainer);
  }

  private bindEventListeners(): void {
    if (!this.pdfContainer) return;

    // Scroll listener
    this.pdfContainer.addEventListener('scroll', () => {
      this.updateScrollOffset();
      this.updateOverlayPositions();
    }, { passive: true });
  }

  private findAnchorElement(insight: ButlerInsightSummary, pageNumber: number): HTMLElement | null {
    if (!this.pdfContainer) return null;

    // Find page element
    const pageElement = this.pdfContainer.querySelector(`[data-page-number="${pageNumber}"]`);
    if (!pageElement) return null;

    // Try to find text element based on text range or content matching
    if (insight.anchors.textRange) {
      const textNodes = this.getTextNodesInRange(pageElement, insight.anchors.textRange);
      if (textNodes.length > 0) {
        return textNodes[0].parentElement as HTMLElement;
      }
    }

    // Fallback: find by content matching
    const walker = document.createTreeWalker(
      pageElement,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node;
    while (node = walker.nextNode()) {
      if (node.textContent && insight.content.includes(node.textContent.trim())) {
        return node.parentElement as HTMLElement;
      }
    }

    return pageElement as HTMLElement; // Ultimate fallback
  }

  private getTextNodesInRange(container: Element, range: { start: number; end: number }): Text[] {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null
    );

    let currentOffset = 0;
    let node;
    
    while (node = walker.nextNode()) {
      const textLength = node.textContent?.length || 0;
      const nodeStart = currentOffset;
      const nodeEnd = currentOffset + textLength;

      // Check if node overlaps with target range
      if (nodeStart < range.end && nodeEnd > range.start) {
        textNodes.push(node as Text);
      }

      currentOffset = nodeEnd;
      
      if (currentOffset > range.end) break;
    }

    return textNodes;
  }

  private createOverlayElement(anchor: ButlerOverlayAnchor): void {
    if (!this.overlayContainer) return;

    const overlayElement = document.createElement('div');
    overlayElement.id = `overlay-${anchor.id}`;
    overlayElement.className = 'butler-overlay';
    overlayElement.style.cssText = `
      position: absolute;
      display: none;
      pointer-events: auto;
      z-index: ${anchor.zIndex};
      max-width: 280px;
      background: rgba(20, 20, 20, 0.95);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(147, 51, 234, 0.3);
      border-radius: 8px;
      padding: 12px;
      color: white;
      font-size: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    `;

    // Build overlay content
    const content = anchor.content;
    overlayElement.innerHTML = `
      <div class="butler-overlay-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div style="display: flex; items-center: gap: 6px;">
          <span style="font-size: 14px;">${content.icon}</span>
          <span style="font-weight: 600; color: rgb(196, 181, 253);">${content.title}</span>
        </div>
        <div style="display: flex; items-center: gap: 4px;">
          <button data-pin-button style="background: none; border: none; color: rgba(255,255,255,0.6); cursor: pointer; padding: 2px;" title="Pin overlay">📍</button>
          <button data-close-button style="background: none; border: none; color: rgba(255,255,255,0.6); cursor: pointer; padding: 2px;" title="Close overlay">✕</button>
        </div>
      </div>
      <div class="butler-overlay-content" style="color: rgba(255,255,255,0.9); line-height: 1.4;">
        ${content.content}
      </div>
      <div class="butler-overlay-footer" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: between; align-items: center;">
        <span style="color: rgba(255,255,255,0.5); font-size: 10px;">
          ${Math.round(content.confidence * 100)}% confidence
        </span>
        <span style="color: rgba(255,255,255,0.5); font-size: 10px;">
          Page ${anchor.pageNumber}
        </span>
      </div>
    `;

    // Bind overlay interactions
    const pinButton = overlayElement.querySelector('[data-pin-button]');
    const closeButton = overlayElement.querySelector('[data-close-button]');

    pinButton?.addEventListener('click', () => {
      this.togglePin(anchor.id);
    });

    closeButton?.addEventListener('click', () => {
      this.hideOverlay(anchor.id);
    });

    this.overlayContainer.appendChild(overlayElement);
  }

  private updateOverlayPosition(anchorId: string): void {
    const anchor = this.state.anchors.get(anchorId);
    const overlayElement = document.getElementById(`overlay-${anchorId}`);
    
    if (!anchor || !overlayElement || !this.pdfContainer) return;

    // Update anchor element bounding rect
    if (anchor.element) {
      const rect = anchor.element.getBoundingClientRect();
      const containerRect = this.pdfContainer.getBoundingClientRect();
      
      // Convert to container-relative coordinates
      const relativeRect = new DOMRect(
        rect.left - containerRect.left,
        rect.top - containerRect.top,
        rect.width,
        rect.height
      );
      
      anchor.boundingRect = relativeRect;
    }

    // Position overlay relative to anchor
    const anchorRect = anchor.boundingRect;
    const overlayRect = overlayElement.getBoundingClientRect();
    
    let left = anchorRect.right + this.config.anchorDistance;
    let top = anchorRect.top;

    // Collision detection with viewport
    if (this.config.collisionDetection) {
      const containerRect = this.pdfContainer.getBoundingClientRect();
      
      // Horizontal overflow - position to left instead
      if (left + overlayRect.width > containerRect.width) {
        left = anchorRect.left - overlayRect.width - this.config.anchorDistance;
      }
      
      // Vertical overflow - adjust upward
      if (top + overlayRect.height > containerRect.height) {
        top = containerRect.height - overlayRect.height - 10;
      }
      
      // Ensure minimum spacing from edges
      left = Math.max(10, Math.min(left, containerRect.width - overlayRect.width - 10));
      top = Math.max(10, top);
    }

    overlayElement.style.left = `${left}px`;
    overlayElement.style.top = `${top}px`;
  }

  private hideOldestOverlay(): void {
    // Find oldest non-pinned overlay
    let oldestId: string | null = null;
    let oldestTimestamp = Date.now();

    this.state.activeOverlays.forEach(id => {
      const anchor = this.state.anchors.get(id);
      if (anchor && !anchor.isPinned) {
        // Use z-index as proxy for age (lower = older)
        if (anchor.zIndex < oldestTimestamp) {
          oldestId = id;
          oldestTimestamp = anchor.zIndex;
        }
      }
    });

    if (oldestId) {
      this.hideOverlay(oldestId);
    }
  }

  private updateViewport(): void {
    if (!this.pdfContainer) return;
    this.state.viewportRect = this.pdfContainer.getBoundingClientRect();
  }

  private updateScrollOffset(): void {
    if (!this.pdfContainer) return;
    this.state.scrollOffset = {
      x: this.pdfContainer.scrollLeft,
      y: this.pdfContainer.scrollTop
    };
  }

  private notifyStateChange(): void {
    this.stateChangeCallbacks.forEach(callback => {
      try {
        callback(this.getState());
      } catch (error) {
        console.error('Butler overlay state change callback error:', error);
      }
    });
  }
}

/**
 * Factory function to create embedded Butler overlay
 */
export function createEmbeddedButlerOverlay(
  config?: Partial<OverlayConfig>
): EmbeddedButlerOverlay {
  return new EmbeddedButlerOverlay(config);
}

/**
 * Default export
 */
export default EmbeddedButlerOverlay;
