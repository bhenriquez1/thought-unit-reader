import { enhancedSemanticAnalyzer } from './enhancedSemanticAnalysis';
import { supportClassificationEngine } from './supportClassification';

// Core interfaces for hierarchical structure
export interface ConceptNode {
  id: string;
  text: string;
  level: number;
  parentId?: string;
  children: string[];
  conceptType: ConceptType;
  importance: number;
  dependencies: string[];
  semanticVector?: number[];
  position: {
    start: number;
    end: number;
  };
}

export interface OutlineSection {
  id: string;
  title: string;
  level: number;
  parentId?: string;
  children: string[];
  mainIdeas: string[];
  supportingPoints: string[];
  conceptNodes: string[];
  coherenceScore: number;
  position: {
    start: number;
    end: number;
  };
}

export interface ConceptHierarchy {
  rootConcepts: string[];
  conceptMap: Map<string, ConceptNode>;
  dependencies: Map<string, string[]>;
  inheritanceChains: string[][];
  abstractionLevels: Map<number, string[]>;
}

export interface DocumentOutline {
  sections: OutlineSection[];
  hierarchy: ConceptHierarchy;
  crossReferences: Map<string, string[]>;
  topicFlow: string[];
  coherenceGraph: Map<string, number>;
}

export enum ConceptType {
  MAIN_IDEA = 'main_idea',
  SUPPORTING_CONCEPT = 'supporting_concept',
  DEFINITION = 'definition',
  EXAMPLE = 'example',
  EVIDENCE = 'evidence',
  CONCLUSION = 'conclusion',
  TRANSITION = 'transition',
  BACKGROUND = 'background'
}

export enum DependencyType {
  PREREQUISITE = 'prerequisite',
  ELABORATION = 'elaboration',
  CONTRAST = 'contrast',
  CAUSATION = 'causation',
  EXEMPLIFICATION = 'exemplification',
  GENERALIZATION = 'generalization'
}

export interface ConceptDependency {
  fromId: string;
  toId: string;
  type: DependencyType;
  strength: number;
  description: string;
}

// Main hierarchical architecture engine
export class HierarchicalArchitectureEngine {
  private conceptIdCounter = 0;
  private sectionIdCounter = 0;

  // Generate automatic document outline
  async generateDocumentOutline(text: string): Promise<DocumentOutline> {
    const sentences = this.splitIntoSentences(text);
    const paragraphs = this.groupIntoParagraphs(sentences);
    
    // Build concept hierarchy first
    const hierarchy = await this.buildConceptHierarchy(sentences);
    
    // Generate sections based on topic shifts and semantic coherence
    const sections = await this.generateSections(paragraphs, hierarchy);
    
    // Build cross-references and topic flow
    const crossReferences = this.buildCrossReferences(hierarchy);
    const topicFlow = this.generateTopicFlow(sections, hierarchy);
    const coherenceGraph = this.buildCoherenceGraph(sections);

    return {
      sections,
      hierarchy,
      crossReferences,
      topicFlow,
      coherenceGraph
    };
  }

  // Build comprehensive concept hierarchy
  private async buildConceptHierarchy(sentences: string[]): Promise<ConceptHierarchy> {
    const conceptMap = new Map<string, ConceptNode>();
    const dependencies = new Map<string, string[]>();
    const abstractionLevels = new Map<number, string[]>();

    // Extract concepts from each sentence
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const concepts = await this.extractConceptsFromSentence(sentence, i);
      
      for (const concept of concepts) {
        conceptMap.set(concept.id, concept);
        
        // Group by abstraction level
        if (!abstractionLevels.has(concept.level)) {
          abstractionLevels.set(concept.level, []);
        }
        abstractionLevels.get(concept.level)!.push(concept.id);
      }
    }

    // Build dependency relationships
    await this.buildDependencyRelationships(conceptMap, dependencies);
    
    // Identify root concepts (highest level, no parents)
    const rootConcepts = Array.from(conceptMap.values())
      .filter(concept => !concept.parentId)
      .sort((a, b) => b.importance - a.importance)
      .map(concept => concept.id);

    // Build inheritance chains
    const inheritanceChains = this.buildInheritanceChains(conceptMap, rootConcepts);

    return {
      rootConcepts,
      conceptMap,
      dependencies,
      inheritanceChains,
      abstractionLevels
    };
  }

  // Extract concepts from individual sentences
  private async extractConceptsFromSentence(sentence: string, position: number): Promise<ConceptNode[]> {
    const concepts: ConceptNode[] = [];
    
    // Use semantic analysis to identify key concepts
    const semantics = enhancedSemanticAnalyzer.analyzeSentenceSemantics(sentence);
    const supportInfo = await supportClassificationEngine.analyzeSupportingInformation([sentence]);

    // Determine concept type based on semantic and support analysis
    const conceptType = this.determineConceptType(sentence, semantics, supportInfo);
    const importance = this.calculateConceptImportance(sentence, semantics, supportInfo);
    const level = this.determineAbstractionLevel(sentence, semantics);

    const concept: ConceptNode = {
      id: `concept_${this.conceptIdCounter++}`,
      text: sentence.trim(),
      level,
      children: [],
      conceptType,
      importance,
      dependencies: [],
      semanticVector: semantics.embedding,
      position: {
        start: position,
        end: position
      }
    };

    concepts.push(concept);
    return concepts;
  }

  // Build dependency relationships between concepts
  private async buildDependencyRelationships(
    conceptMap: Map<string, ConceptNode>,
    dependencies: Map<string, string[]>
  ): Promise<void> {
    const concepts = Array.from(conceptMap.values());
    
    for (let i = 0; i < concepts.length; i++) {
      const concept = concepts[i];
      const conceptDeps: string[] = [];

      for (let j = 0; j < concepts.length; j++) {
        if (i === j) continue;
        
        const otherConcept = concepts[j];
        const dependencyStrength = await this.calculateDependencyStrength(concept, otherConcept);
        
        if (dependencyStrength > 0.6) {
          conceptDeps.push(otherConcept.id);
          
          // Set parent-child relationships for hierarchical structure
          if (concept.level > otherConcept.level && dependencyStrength > 0.8) {
            concept.parentId = otherConcept.id;
            otherConcept.children.push(concept.id);
          }
        }
      }

      concept.dependencies = conceptDeps;
      dependencies.set(concept.id, conceptDeps);
    }
  }

  // Calculate dependency strength between two concepts
  private async calculateDependencyStrength(concept1: ConceptNode, concept2: ConceptNode): Promise<number> {
    if (!concept1.semanticVector || !concept2.semanticVector) return 0;

    // Semantic similarity
    const vec1 = enhancedSemanticAnalyzer.analyzeSentenceSemantics(concept1.text);
    const vec2 = enhancedSemanticAnalyzer.analyzeSentenceSemantics(concept2.text);
    const semanticSimilarity = enhancedSemanticAnalyzer.calculateSemanticSimilarity(vec1, vec2);

    // Position proximity (concepts closer together are more likely to be related)
    const positionDistance = Math.abs(concept1.position.start - concept2.position.start);
    const proximityScore = Math.max(0, 1 - (positionDistance / 100));

    // Level relationship (concepts at different levels may have hierarchical relationships)
    const levelDifference = Math.abs(concept1.level - concept2.level);
    const levelScore = levelDifference === 1 ? 0.3 : levelDifference === 0 ? 0.2 : 0.1;

    // Concept type compatibility
    const typeCompatibility = this.calculateTypeCompatibility(concept1.conceptType, concept2.conceptType);

    return (semanticSimilarity * 0.4) + (proximityScore * 0.3) + (levelScore * 0.2) + (typeCompatibility * 0.1);
  }

  // Generate sections based on topic coherence
  private async generateSections(paragraphs: string[][], hierarchy: ConceptHierarchy): Promise<OutlineSection[]> {
    const sections: OutlineSection[] = [];
    let currentSection: OutlineSection | null = null;
    let paragraphIndex = 0;

    for (const paragraph of paragraphs) {
      const paragraphText = paragraph.join(' ');
      const coherenceScore = await this.calculateParagraphCoherence(paragraphText, currentSection);
      
      // Start new section if coherence drops significantly or we detect a topic shift
      if (!currentSection || coherenceScore < 0.5 || await this.detectTopicShift(paragraphText, currentSection)) {
        if (currentSection) {
          sections.push(currentSection);
        }

        currentSection = {
          id: `section_${this.sectionIdCounter++}`,
          title: await this.generateSectionTitle(paragraphText),
          level: this.determineSectionLevel(paragraphText, sections.length),
          children: [],
          mainIdeas: [],
          supportingPoints: [],
          conceptNodes: [],
          coherenceScore: 1.0,
          position: {
            start: paragraphIndex,
            end: paragraphIndex
          }
        };
      }

      // Add paragraph content to current section
      if (currentSection) {
        currentSection.position.end = paragraphIndex;
        await this.addParagraphToSection(paragraph, currentSection, hierarchy);
      }

      paragraphIndex++;
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  }

  // Build inheritance chains showing concept relationships
  private buildInheritanceChains(conceptMap: Map<string, ConceptNode>, rootConcepts: string[]): string[][] {
    const chains: string[][] = [];

    for (const rootId of rootConcepts) {
      const chain = this.buildChainFromRoot(rootId, conceptMap);
      if (chain.length > 1) {
        chains.push(chain);
      }
    }

    return chains;
  }

  // Build a single inheritance chain from a root concept
  private buildChainFromRoot(rootId: string, conceptMap: Map<string, ConceptNode>): string[] {
    const chain: string[] = [rootId];
    const root = conceptMap.get(rootId);
    
    if (!root) return chain;

    // Follow the most important child path
    let currentId = rootId;
    while (true) {
      const current = conceptMap.get(currentId);
      if (!current || current.children.length === 0) break;

      // Find the most important child
      const mostImportantChild = current.children
        .map(childId => conceptMap.get(childId)!)
        .filter(child => child)
        .sort((a, b) => b.importance - a.importance)[0];

      if (mostImportantChild) {
        chain.push(mostImportantChild.id);
        currentId = mostImportantChild.id;
      } else {
        break;
      }
    }

    return chain;
  }

  // Helper methods
  private splitIntoSentences(text: string): string[] {
    return text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  }

  private groupIntoParagraphs(sentences: string[]): string[][] {
    const paragraphs: string[][] = [];
    let currentParagraph: string[] = [];

    for (const sentence of sentences) {
      currentParagraph.push(sentence);
      
      // Simple paragraph detection - could be enhanced
      if (currentParagraph.length >= 3) {
        paragraphs.push([...currentParagraph]);
        currentParagraph = [];
      }
    }

    if (currentParagraph.length > 0) {
      paragraphs.push(currentParagraph);
    }

    return paragraphs;
  }

  private determineConceptType(sentence: string, semantics: any, supportInfo: any): ConceptType {
    // Simple heuristic-based classification - could be enhanced with ML
    if (sentence.toLowerCase().includes('therefore') || sentence.toLowerCase().includes('conclude')) {
      return ConceptType.CONCLUSION;
    }
    if (sentence.toLowerCase().includes('for example') || sentence.toLowerCase().includes('such as')) {
      return ConceptType.EXAMPLE;
    }
    if (sentence.toLowerCase().includes('define') || sentence.toLowerCase().includes('means')) {
      return ConceptType.DEFINITION;
    }
    if (supportInfo.supportTypes?.length > 0) {
      return ConceptType.SUPPORTING_CONCEPT;
    }
    return ConceptType.MAIN_IDEA;
  }

  private calculateConceptImportance(sentence: string, semantics: any, supportInfo: any): number {
    let importance = 0.5; // Base importance
    
    // Boost for semantic richness
    if (semantics.conceptualDensity > 0.7) importance += 0.2;
    
    // Boost for high conceptual density (indicator of main ideas)
    if (semantics.conceptualDensity > 0.6) importance += 0.3;
    
    // Adjust based on support classification
    if (supportInfo.supportTypes?.includes('evidence')) importance += 0.1;
    
    return Math.min(1.0, importance);
  }

  private determineAbstractionLevel(sentence: string, semantics: any): number {
    // Simple heuristic - could be enhanced
    if (semantics.conceptualDensity > 0.6) return 1;
    if (sentence.toLowerCase().includes('specifically') || sentence.toLowerCase().includes('detail')) return 3;
    return 2;
  }

  private calculateTypeCompatibility(type1: ConceptType, type2: ConceptType): number {
    const compatibilityMatrix: Record<ConceptType, Record<ConceptType, number>> = {
      [ConceptType.MAIN_IDEA]: {
        [ConceptType.SUPPORTING_CONCEPT]: 0.8,
        [ConceptType.EVIDENCE]: 0.7,
        [ConceptType.EXAMPLE]: 0.6,
        [ConceptType.DEFINITION]: 0.5,
        [ConceptType.CONCLUSION]: 0.4,
        [ConceptType.TRANSITION]: 0.3,
        [ConceptType.BACKGROUND]: 0.2,
        [ConceptType.MAIN_IDEA]: 0.1
      },
      [ConceptType.SUPPORTING_CONCEPT]: {
        [ConceptType.MAIN_IDEA]: 0.8,
        [ConceptType.EVIDENCE]: 0.7,
        [ConceptType.EXAMPLE]: 0.6,
        [ConceptType.SUPPORTING_CONCEPT]: 0.5,
        [ConceptType.DEFINITION]: 0.4,
        [ConceptType.CONCLUSION]: 0.3,
        [ConceptType.TRANSITION]: 0.2,
        [ConceptType.BACKGROUND]: 0.1
      },
      // Add other combinations as needed
      [ConceptType.DEFINITION]: {
        [ConceptType.MAIN_IDEA]: 0.5,
        [ConceptType.SUPPORTING_CONCEPT]: 0.4,
        [ConceptType.EVIDENCE]: 0.3,
        [ConceptType.EXAMPLE]: 0.2,
        [ConceptType.DEFINITION]: 0.1,
        [ConceptType.CONCLUSION]: 0.1,
        [ConceptType.TRANSITION]: 0.1,
        [ConceptType.BACKGROUND]: 0.1
      },
      [ConceptType.EXAMPLE]: {
        [ConceptType.MAIN_IDEA]: 0.6,
        [ConceptType.SUPPORTING_CONCEPT]: 0.6,
        [ConceptType.EVIDENCE]: 0.4,
        [ConceptType.EXAMPLE]: 0.3,
        [ConceptType.DEFINITION]: 0.2,
        [ConceptType.CONCLUSION]: 0.2,
        [ConceptType.TRANSITION]: 0.1,
        [ConceptType.BACKGROUND]: 0.1
      },
      [ConceptType.EVIDENCE]: {
        [ConceptType.MAIN_IDEA]: 0.7,
        [ConceptType.SUPPORTING_CONCEPT]: 0.7,
        [ConceptType.EVIDENCE]: 0.5,
        [ConceptType.EXAMPLE]: 0.4,
        [ConceptType.DEFINITION]: 0.3,
        [ConceptType.CONCLUSION]: 0.6,
        [ConceptType.TRANSITION]: 0.1,
        [ConceptType.BACKGROUND]: 0.2
      },
      [ConceptType.CONCLUSION]: {
        [ConceptType.MAIN_IDEA]: 0.4,
        [ConceptType.SUPPORTING_CONCEPT]: 0.3,
        [ConceptType.EVIDENCE]: 0.6,
        [ConceptType.EXAMPLE]: 0.2,
        [ConceptType.DEFINITION]: 0.1,
        [ConceptType.CONCLUSION]: 0.2,
        [ConceptType.TRANSITION]: 0.3,
        [ConceptType.BACKGROUND]: 0.1
      },
      [ConceptType.TRANSITION]: {
        [ConceptType.MAIN_IDEA]: 0.3,
        [ConceptType.SUPPORTING_CONCEPT]: 0.2,
        [ConceptType.EVIDENCE]: 0.1,
        [ConceptType.EXAMPLE]: 0.1,
        [ConceptType.DEFINITION]: 0.1,
        [ConceptType.CONCLUSION]: 0.3,
        [ConceptType.TRANSITION]: 0.4,
        [ConceptType.BACKGROUND]: 0.2
      },
      [ConceptType.BACKGROUND]: {
        [ConceptType.MAIN_IDEA]: 0.2,
        [ConceptType.SUPPORTING_CONCEPT]: 0.1,
        [ConceptType.EVIDENCE]: 0.2,
        [ConceptType.EXAMPLE]: 0.1,
        [ConceptType.DEFINITION]: 0.1,
        [ConceptType.CONCLUSION]: 0.1,
        [ConceptType.TRANSITION]: 0.2,
        [ConceptType.BACKGROUND]: 0.3
      }
    };

    return compatibilityMatrix[type1]?.[type2] || 0.1;
  }

  private async calculateParagraphCoherence(paragraphText: string, currentSection: OutlineSection | null): Promise<number> {
    if (!currentSection) return 1.0;
    
    // Use semantic analyzer to calculate coherence with existing section content
    const sectionText = currentSection.mainIdeas.join(' ') + ' ' + currentSection.supportingPoints.join(' ');
    const paragraphVector = enhancedSemanticAnalyzer.analyzeSentenceSemantics(paragraphText);
    const sectionVector = enhancedSemanticAnalyzer.analyzeSentenceSemantics(sectionText);
    return enhancedSemanticAnalyzer.calculateSemanticSimilarity(paragraphVector, sectionVector);
  }

  private async detectTopicShift(paragraphText: string, currentSection: OutlineSection): Promise<boolean> {
    // Simple topic shift detection - could be enhanced
    const similarity = await this.calculateParagraphCoherence(paragraphText, currentSection);
    return similarity < 0.4;
  }

  private async generateSectionTitle(paragraphText: string): Promise<string> {
    // Extract key phrases for title generation
    const words = paragraphText.split(' ').filter(word => word.length > 3);
    const keyWords = words.slice(0, 3).join(' ');
    return keyWords || 'Section';
  }

  private determineSectionLevel(paragraphText: string, sectionCount: number): number {
    // Simple level determination - could be enhanced
    return sectionCount === 0 ? 1 : 2;
  }

  private async addParagraphToSection(
    paragraph: string[],
    section: OutlineSection,
    hierarchy: ConceptHierarchy
  ): Promise<void> {
    const paragraphText = paragraph.join(' ');
    
    // Classify as main idea or supporting point
    const semantics = enhancedSemanticAnalyzer.analyzeSentenceSemantics(paragraphText);
    
    // Check if this appears to be a main idea based on semantic analysis
    // We'll use a simple heuristic since isMainIdea is not directly available
    const isMainIdea = semantics.keyTerms.length > 3 && semantics.conceptualDensity > 0.5;
    
    if (isMainIdea) {
      section.mainIdeas.push(paragraphText);
    } else {
      section.supportingPoints.push(paragraphText);
    }

    // Add relevant concept nodes
    for (const [conceptId, concept] of hierarchy.conceptMap) {
      if (concept.text.includes(paragraphText.substring(0, 50))) {
        section.conceptNodes.push(conceptId);
      }
    }
  }

  private buildCrossReferences(hierarchy: ConceptHierarchy): Map<string, string[]> {
    const crossRefs = new Map<string, string[]>();
    
    for (const [conceptId, dependencies] of hierarchy.dependencies) {
      crossRefs.set(conceptId, dependencies);
    }
    
    return crossRefs;
  }

  private generateTopicFlow(sections: OutlineSection[], hierarchy: ConceptHierarchy): string[] {
    return sections.map(section => section.id);
  }

  private buildCoherenceGraph(sections: OutlineSection[]): Map<string, number> {
    const graph = new Map<string, number>();
    
    for (const section of sections) {
      graph.set(section.id, section.coherenceScore);
    }
    
    return graph;
  }
}

// Export singleton instance
export const hierarchicalArchitectureEngine = new HierarchicalArchitectureEngine();
