"use client";

import { 
  universalPDRMGenerator, 
  type UniversalPDRMDocument, 
  type UniversalPDRMSection,
  type ButlerInsight 
} from "@/lib/universalPdrmGenerator";

export interface PDRMButlerNote {
  id: string;
  title: string;
  timestamp: Date;
  sourceText: string;
  pdrmSection: UniversalPDRMSection;
  butlerInsights: ButlerInsight[];
  subject: string;
  confidence: number;
  studyLevel: 'Basic' | 'Intermediate' | 'Advanced';
  tags: string[];
  flashcardReady: boolean;
}

export interface NoteLab_PDRM_Butler_State {
  activeDocument: UniversalPDRMDocument | null;
  currentNotes: PDRMButlerNote[];
  butlerMemory: Map<string, ButlerInsight[]>; // Page/concept -> insights
  crossReaderSync: {
    lastUpdated: Date;
    syncedAcrossReaders: boolean;
    persistentInsights: ButlerInsight[];
  };
}

class NoteLab_Butler_Integration {
  private state: NoteLab_PDRM_Butler_State = {
    activeDocument: null,
    currentNotes: [],
    butlerMemory: new Map(),
    crossReaderSync: {
      lastUpdated: new Date(),
      syncedAcrossReaders: false,
      persistentInsights: []
    }
  };

  private listeners: Set<(state: NoteLab_PDRM_Butler_State) => void> = new Set();

  /**
   * Generate a PDRM-structured note with Butler insights
   */
  async generatePDRMButlerNote(
    selectedText: string,
    context: {
      pageNumber?: number;
      chapterTitle?: string;
      bookId?: string;
      userId?: string;
    } = {}
  ): Promise<PDRMButlerNote> {
    console.log('📝🔬 Generating PDRM Butler Note for:', selectedText.slice(0, 50) + '...');

    try {
      // Step 1: Generate Universal PDRM analysis
      const pdrmDoc = await universalPDRMGenerator.generatePDRMDocument(
        selectedText,
        {
          filename: `notelab-${Date.now()}`,
          pageCount: 1,
          progressCallback: (progress) => console.log(`📝 Note generation: ${progress}`)
        }
      );

      // Step 2: Extract the first (and likely only) PDRM section
      const sectionEntries = Array.from(pdrmDoc.sections.entries());
      if (sectionEntries.length === 0) {
        throw new Error('No PDRM sections generated from text');
      }

      const [sectionId, pdrmSection] = sectionEntries[0];

      // Step 3: Collect all Butler insights from this section
      const allButlerInsights: ButlerInsight[] = [
        ...pdrmSection.pattern.butlerInsights,
        ...pdrmSection.decisionRule.butlerInsights,
        ...pdrmSection.mechanism.butlerInsights,
        ...pdrmSection.application.butlerInsights,
        ...pdrmSection.wrongAnswerMap.butlerInsights,
        ...pdrmSection.visualAnchor.butlerInsights,
        ...pdrmSection.crossLinks.butlerInsights,
        ...pdrmSection.reflection.butlerInsights
      ];

      console.log(`📝🔬 Generated ${allButlerInsights.length} Butler insights for note`);

      // Step 4: Determine study level based on content complexity
      const studyLevel = this.determineStudyLevel(selectedText, pdrmSection);

      // Step 5: Extract tags from concepts and Butler insights
      const tags = this.extractNoteTags(pdrmSection, allButlerInsights);

      // Step 6: Create the PDRM Butler Note
      const note: PDRMButlerNote = {
        id: `pdrm-butler-note-${Date.now()}`,
        title: this.generateNoteTitle(pdrmSection),
        timestamp: new Date(),
        sourceText: selectedText,
        pdrmSection,
        butlerInsights: allButlerInsights,
        subject: pdrmDoc.subject,
        confidence: pdrmDoc.metadata.avgConfidence,
        studyLevel,
        tags,
        flashcardReady: allButlerInsights.length > 0 && this.extractContent(pdrmSection.pattern).length > 50
      };

      // Step 7: Store in state and sync
      this.state.currentNotes.push(note);
      this.updateButlerMemory(context.pageNumber || 1, allButlerInsights);
      this.syncAcrossReaders();
      this.notifyListeners();

      console.log('✅ PDRM Butler Note generated:', {
        title: note.title,
        subject: note.subject,
        butlerInsights: note.butlerInsights.length,
        studyLevel: note.studyLevel,
        flashcardReady: note.flashcardReady
      });

      return note;

    } catch (error) {
      console.error('❌ PDRM Butler Note generation failed:', error);
      throw new Error(`Failed to generate PDRM Butler note: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Helper to extract text content from RichTextContent
   */
  private extractContent(richContent: any): string {
    if (typeof richContent === 'string') return richContent;
    if (richContent?.text) return richContent.text;
    if (richContent?.content) return richContent.content;
    if (richContent?.rawText) return richContent.rawText;
    return String(richContent || '');
  }

  /**
   * Format a PDRM Butler note as markdown for export
   */
  formatNoteAsMarkdown(note: PDRMButlerNote): string {
    const sections = [
      `# 📝🔬 PDRM Butler Study Note: ${note.title}`,
      ``,
      `**Subject:** ${note.subject} | **Study Level:** ${note.studyLevel} | **Confidence:** ${Math.round(note.confidence * 100)}%`,
      `**Created:** ${note.timestamp.toLocaleDateString()} | **Tags:** ${note.tags.join(', ')}`,
      ``,
      `## 🎯 Pattern Recognition`,
      `${this.extractContent(note.pdrmSection.pattern)}`,
      ``
    ];

    // Add Butler insights for Pattern
    if (note.pdrmSection.pattern.butlerInsights.length > 0) {
      sections.push(`**🔬 Butler Insights:**`);
      note.pdrmSection.pattern.butlerInsights.forEach(insight => {
        sections.push(`- *${insight.type.replace('_', ' ')}*: ${insight.content}`);
        if (insight.visualCue) sections.push(`  - 🎨 Visual cue: ${insight.visualCue}`);
      });
      sections.push(``);
    }

    sections.push(
      `## ⚖️ Decision Rule`,
      `${this.extractContent(note.pdrmSection.decisionRule)}`,
      ``
    );

    // Add Butler insights for Decision Rule
    if (note.pdrmSection.decisionRule.butlerInsights.length > 0) {
      sections.push(`**🔬 Butler Insights:**`);
      note.pdrmSection.decisionRule.butlerInsights.forEach(insight => {
        sections.push(`- *${insight.type.replace('_', ' ')}*: ${insight.content}`);
      });
      sections.push(``);
    }

    sections.push(
      `## ⚙️ Mechanism`,
      `${this.extractContent(note.pdrmSection.mechanism)}`,
      ``
    );

    // Add Butler insights for Mechanism
    if (note.pdrmSection.mechanism.butlerInsights.length > 0) {
      sections.push(`**🔬 Butler Insights:**`);
      note.pdrmSection.mechanism.butlerInsights.forEach(insight => {
        sections.push(`- *${insight.type.replace('_', ' ')}*: ${insight.content}`);
      });
      sections.push(``);
    }

    sections.push(
      `## 🎯 Application`,
      `${this.extractContent(note.pdrmSection.application)}`,
      ``
    );

    // Add Butler insights for Application
    if (note.pdrmSection.application.butlerInsights.length > 0) {
      sections.push(`**🔬 Butler Insights:**`);
      note.pdrmSection.application.butlerInsights.forEach(insight => {
        sections.push(`- *${insight.type.replace('_', ' ')}*: ${insight.content}`);
      });
      sections.push(``);
    }

    sections.push(
      `## ❌ Wrong Answer Map`,
      `${this.extractContent(note.pdrmSection.wrongAnswerMap)}`,
      ``
    );

    // Add Butler warnings for Wrong Answer Map
    if (note.pdrmSection.wrongAnswerMap.butlerInsights.length > 0) {
      sections.push(`**🔬 Butler Warnings:**`);
      note.pdrmSection.wrongAnswerMap.butlerInsights.forEach(insight => {
        sections.push(`- ⚠️ *${insight.type.replace('_', ' ')}*: ${insight.content}`);
      });
      sections.push(``);
    }

    sections.push(
      `## 🎨 Visual Anchor`,
      `${this.extractContent(note.pdrmSection.visualAnchor)}`,
      ``
    );

    // Add Butler visual metaphors
    if (note.pdrmSection.visualAnchor.butlerInsights.length > 0) {
      sections.push(`**🔬 Butler Visual Metaphors:**`);
      note.pdrmSection.visualAnchor.butlerInsights.forEach(insight => {
        sections.push(`- 🎭 *${insight.type.replace('_', ' ')}*: ${insight.content}`);
        if (insight.visualCue) sections.push(`  - 🎨 Draw this: ${insight.visualCue}`);
      });
      sections.push(``);
    }

    sections.push(
      `## 🔗 Cross Links`,
      `${this.extractContent(note.pdrmSection.crossLinks)}`,
      ``
    );

    sections.push(
      `## 🤔 Reflection`,
      `${this.extractContent(note.pdrmSection.reflection)}`,
      ``
    );

    // Add summary of all Butler insights
    if (note.butlerInsights.length > 0) {
      sections.push(
        `## 🧠 Complete Butler Insight Summary`,
        `*This note contains ${note.butlerInsights.length} Butler insights to enhance your understanding:*`,
        ``
      );

      const insightsByType = new Map<string, ButlerInsight[]>();
      note.butlerInsights.forEach(insight => {
        const type = insight.type;
        if (!insightsByType.has(type)) {
          insightsByType.set(type, []);
        }
        insightsByType.get(type)!.push(insight);
      });

      for (const [type, insights] of insightsByType.entries()) {
        sections.push(`### ${type.replace('_', ' ')} (${insights.length})`);
        insights.forEach((insight, index) => {
          sections.push(`${index + 1}. ${insight.content}`);
          if (insight.relatedConcepts.length > 0) {
            sections.push(`   - *Related:* ${insight.relatedConcepts.slice(0, 3).join(', ')}`);
          }
        });
        sections.push(``);
      }
    }

    // Add flashcard generation info
    if (note.flashcardReady) {
      sections.push(
        `## 📇 Flashcard Ready`,
        `✅ This note is ready for flashcard generation with Butler insights included.`,
        ``,
        `**Suggested flashcard format:**`,
        `- **Front:** ${note.pdrmSection.pattern.content.slice(0, 100)}...`,
        `- **Back:** PDRM analysis + Butler insights`,
        ``
      );
    }

    sections.push(
      `---`,
      `*Generated by NoteLab PDRM Butler Integration | Study this with spaced repetition for best results*`
    );

    return sections.join('\n');
  }

  /**
   * Generate flashcards from a PDRM Butler note
   */
  generateFlashcardsFromNote(note: PDRMButlerNote): Array<{
    id: string;
    front: string;
    back: string;
    subject: string;
    studyLevel: string;
    butlerEnhanced: boolean;
  }> {
    const flashcards: Array<{
      id: string;
      front: string;
      back: string;
      subject: string;
      studyLevel: string;
      butlerEnhanced: boolean;
    }> = [];

    // Pattern Recognition Card
    flashcards.push({
      id: `${note.id}-pattern`,
      front: `🎯 Pattern: What pattern do you recognize in this scenario?\n\n"${note.sourceText.slice(0, 150)}..."`,
      back: `**Pattern:** ${this.extractContent(note.pdrmSection.pattern)}\n\n` +
             (note.pdrmSection.pattern.butlerInsights.length > 0 
               ? `🔬 **Butler Insight:** ${note.pdrmSection.pattern.butlerInsights[0].content}`
               : ''),
      subject: note.subject,
      studyLevel: note.studyLevel,
      butlerEnhanced: note.pdrmSection.pattern.butlerInsights.length > 0
    });

    // Decision Rule Card
    flashcards.push({
      id: `${note.id}-decision`,
      front: `⚖️ Decision Rule: How do you decide when to apply this concept?`,
      back: `**Decision Rule:** ${this.extractContent(note.pdrmSection.decisionRule)}\n\n` +
             (note.pdrmSection.decisionRule.butlerInsights.length > 0 
               ? `🔬 **Butler Insight:** ${note.pdrmSection.decisionRule.butlerInsights[0].content}`
               : ''),
      subject: note.subject,
      studyLevel: note.studyLevel,
      butlerEnhanced: note.pdrmSection.decisionRule.butlerInsights.length > 0
    });

    // Mechanism Card
    flashcards.push({
      id: `${note.id}-mechanism`,
      front: `⚙️ Mechanism: How does this actually work?`,
      back: `**Mechanism:** ${this.extractContent(note.pdrmSection.mechanism)}\n\n` +
             (note.pdrmSection.mechanism.butlerInsights.length > 0 
               ? `🔬 **Butler Insight:** ${note.pdrmSection.mechanism.butlerInsights[0].content}`
               : ''),
      subject: note.subject,
      studyLevel: note.studyLevel,
      butlerEnhanced: note.pdrmSection.mechanism.butlerInsights.length > 0
    });

    // Application Card
    flashcards.push({
      id: `${note.id}-application`,
      front: `🎯 Application: When and how do you use this in practice?`,
      back: `**Application:** ${this.extractContent(note.pdrmSection.application)}\n\n` +
             (note.pdrmSection.application.butlerInsights.length > 0 
               ? `🔬 **Butler Insight:** ${note.pdrmSection.application.butlerInsights[0].content}`
               : ''),
      subject: note.subject,
      studyLevel: note.studyLevel,
      butlerEnhanced: note.pdrmSection.application.butlerInsights.length > 0
    });

    // Wrong Answer Map Card
    flashcards.push({
      id: `${note.id}-wrong`,
      front: `❌ Common Mistakes: What are common errors with this concept?`,
      back: `**Wrong Answer Map:** ${this.extractContent(note.pdrmSection.wrongAnswerMap)}\n\n` +
             (note.pdrmSection.wrongAnswerMap.butlerInsights.length > 0 
               ? `🔬 **Butler Warning:** ${note.pdrmSection.wrongAnswerMap.butlerInsights[0].content}`
               : ''),
      subject: note.subject,
      studyLevel: note.studyLevel,
      butlerEnhanced: note.pdrmSection.wrongAnswerMap.butlerInsights.length > 0
    });

    // Visual Anchor Card (if Butler visual metaphors exist)
    if (note.pdrmSection.visualAnchor.butlerInsights.length > 0) {
      flashcards.push({
        id: `${note.id}-visual`,
        front: `🎨 Visual Memory: What's a good way to visualize/remember this?`,
        back: `**Visual Anchor:** ${this.extractContent(note.pdrmSection.visualAnchor)}\n\n` +
               `🔬 **Butler Visual Metaphor:** ${note.pdrmSection.visualAnchor.butlerInsights[0].content}` +
               (note.pdrmSection.visualAnchor.butlerInsights[0].visualCue 
                 ? `\n\n🎭 **Draw:** ${note.pdrmSection.visualAnchor.butlerInsights[0].visualCue}`
                 : ''),
        subject: note.subject,
        studyLevel: note.studyLevel,
        butlerEnhanced: true
      });
    }

    console.log(`📇 Generated ${flashcards.length} flashcards from PDRM Butler note`);
    return flashcards;
  }

  /**
   * Update Butler memory for cross-reader sync
   */
  private updateButlerMemory(pageNumber: number, insights: ButlerInsight[]): void {
    const key = `page-${pageNumber}`;
    this.state.butlerMemory.set(key, insights);
    
    // Update persistent insights (ones marked as persistent)
    const persistent = insights.filter(insight => insight.persistent);
    this.state.crossReaderSync.persistentInsights.push(...persistent);
    
    console.log(`🧠 Updated Butler memory: page ${pageNumber} with ${insights.length} insights (${persistent.length} persistent)`);
  }

  /**
   * Sync Butler state across all readers
   */
  private syncAcrossReaders(): void {
    this.state.crossReaderSync.lastUpdated = new Date();
    this.state.crossReaderSync.syncedAcrossReaders = true;
    
    // Emit sync event for other readers to pick up
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('butler-memory-sync', {
        detail: {
          butlerMemory: Array.from(this.state.butlerMemory.entries()),
          persistentInsights: this.state.crossReaderSync.persistentInsights
        }
      }));
    }
    
    console.log('🔄 Butler state synced across readers');
  }

  /**
   * Get Butler insights for a specific page/concept
   */
  getButlerInsightsFor(pageNumber: number): ButlerInsight[] {
    const key = `page-${pageNumber}`;
    return this.state.butlerMemory.get(key) || [];
  }

  /**
   * Get all persistent Butler insights
   */
  getPersistentButlerInsights(): ButlerInsight[] {
    return this.state.crossReaderSync.persistentInsights;
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: NoteLab_PDRM_Butler_State) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.state));
  }

  private determineStudyLevel(text: string, section: UniversalPDRMSection): 'Basic' | 'Intermediate' | 'Advanced' {
    const complexity = text.length + this.extractContent(section.mechanism).length + this.extractContent(section.crossLinks).length;
    if (complexity < 500) return 'Basic';
    if (complexity < 1500) return 'Intermediate';
    return 'Advanced';
  }

  private extractNoteTags(section: UniversalPDRMSection, insights: ButlerInsight[]): string[] {
    const tags = new Set<string>();
    
    // Add tags from Butler insight concepts
    insights.forEach(insight => {
      insight.relatedConcepts.forEach(concept => {
        if (concept.length > 2 && concept.length < 20) {
          tags.add(concept.toLowerCase());
        }
      });
    });
    
    // Add PDRM-specific tags
    tags.add('pdrm-structured');
    tags.add('butler-enhanced');
    
    if (insights.some(i => i.type === 'metaphor')) tags.add('visual-learning');
    if (insights.some(i => i.type === 'warning')) tags.add('common-mistakes');
    if (insights.some(i => i.persistent)) tags.add('key-concept');
    
    return Array.from(tags).slice(0, 8); // Limit to 8 tags
  }

  private generateNoteTitle(section: UniversalPDRMSection): string {
    const pattern = this.extractContent(section.pattern).slice(0, 50).trim();
    const cleanPattern = pattern.replace(/[^\w\s]/g, '').trim();
    return cleanPattern || `PDRM Study Note ${Date.now()}`;
  }

  /**
   * Export all notes as structured study guide
   */
  exportStudyGuide(): string {
    const guide = [
      `# 📝🔬 PDRM Butler Study Guide`,
      ``,
      `Generated: ${new Date().toLocaleDateString()}`,
      `Total Notes: ${this.state.currentNotes.length}`,
      `Subjects: ${[...new Set(this.state.currentNotes.map(n => n.subject))].join(', ')}`,
      ``,
      `## 🧠 Butler Memory Summary`,
      `- Total Butler Insights: ${Array.from(this.state.butlerMemory.values()).flat().length}`,
      `- Persistent Insights: ${this.state.crossReaderSync.persistentInsights.length}`,
      `- Last Sync: ${this.state.crossReaderSync.lastUpdated.toLocaleString()}`,
      ``,
      `---`,
      ``
    ];

    this.state.currentNotes.forEach((note, index) => {
      guide.push(`## Note ${index + 1}: ${note.title}`);
      guide.push(this.formatNoteAsMarkdown(note));
      guide.push(`\n---\n`);
    });

    return guide.join('\n');
  }

  /**
   * Get current state
   */
  getState(): NoteLab_PDRM_Butler_State {
    return { ...this.state };
  }
}

// Export singleton instance
export const noteLabButlerIntegration = new NoteLab_Butler_Integration();

// Export types and utilities
export { NoteLab_Butler_Integration };
