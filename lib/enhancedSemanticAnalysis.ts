/**
 * Enhanced Semantic Analysis Engine
 * Provides advanced semantic understanding for improved main idea and supporting information extraction
 */

import { ThoughtUnit, MainIdeaAnalysis } from './thoughtUnitExtraction';

export interface SemanticVector {
  embedding: number[];
  keyTerms: WeightedTerm[];
  conceptualDensity: number;
  abstractionLevel: 'concrete' | 'abstract' | 'mixed';
  topicSignature: string[];
}

export interface WeightedTerm {
  term: string;
  weight: number;
  frequency: number;
  semanticImportance: number;
}

export interface CoherenceGraph {
  nodes: SemanticNode[];
  edges: SemanticEdge[];
  coherenceScore: number;
  topicClusters: TopicCluster[];
  mainTopicId: string | null;
}

export interface SemanticNode {
  id: string;
  text: string;
  vector: SemanticVector;
  importance: number;
  isMainIdea: boolean;
}

export interface SemanticEdge {
  fromId: string;
  toId: string;
  similarity: number;
  relationshipType: 'supports' | 'elaborates' | 'contrasts' | 'follows' | 'defines';
  strength: number;
}

export interface TopicCluster {
  id: string;
  sentences: string[];
  centroid: number[];
  coherenceScore: number;
  mainTopic: string;
  keywords: string[];
}

export interface EnhancedMainIdeaAnalysis extends MainIdeaAnalysis {
  semanticCoherence: number;
  topicClusters: TopicCluster[];
  supportingEvidence: SupportingEvidence[];
  conceptualFrameworkEnhanced: ConceptualFramework;
  confidenceFactors: ConfidenceFactors;
}

export interface SupportingEvidence {
  text: string;
  type: 'example' | 'statistic' | 'quote' | 'explanation' | 'definition' | 'analogy';
  relevanceScore: number;
  evidenceStrength: number;
  semanticDistance: number;
}

export interface ConceptualFramework {
  primaryConcepts: string[];
  conceptHierarchy: ConceptNode[];
  relationshipMap: ConceptRelationship[];
  abstractionLevel: number;
}

export interface ConceptNode {
  concept: string;
  level: number;
  children: string[];
  parent: string | null;
  importance: number;
}

export interface ConceptRelationship {
  from: string;
  to: string;
  type: 'is-a' | 'part-of' | 'causes' | 'enables' | 'contradicts';
  strength: number;
}

export interface ConfidenceFactors {
  structuralWeight: number;
  semanticCentrality: number;
  linguisticMarkers: number;
  positionWeight: number;
  coherenceScore: number;
  domainSpecificScore: number;
  combinedConfidence: number;
}

export interface AnalysisContext {
  documentType: 'academic' | 'technical' | 'business' | 'general';
  domain: string;
  complexity: 'simple' | 'moderate' | 'complex';
  userExpertiseLevel: 'beginner' | 'intermediate' | 'expert';
}

export interface EnhancedAnalysisOptions {
  enableSemanticClustering: boolean;
  confidenceThreshold: number;
  maxTopicClusters: number;
  semanticSimilarityThreshold: number;
  context?: AnalysisContext;
}

class EnhancedSemanticAnalyzer {
  private stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those'
  ]);

  private academicIndicators = new Set([
    'research', 'study', 'analysis', 'findings', 'results', 'conclusion', 'hypothesis',
    'theory', 'methodology', 'evidence', 'data', 'significant', 'correlation'
  ]);

  private technicalIndicators = new Set([
    'system', 'process', 'algorithm', 'implementation', 'architecture', 'framework',
    'protocol', 'specification', 'optimization', 'performance', 'configuration'
  ]);

  private businessIndicators = new Set([
    'strategy', 'market', 'revenue', 'profit', 'customer', 'business', 'management',
    'organization', 'competitive', 'growth', 'investment', 'stakeholder'
  ]);

  // Enhanced sentence-level semantic analysis
  public analyzeSentenceSemantics(sentence: string, context?: AnalysisContext): SemanticVector {
    const words = this.tokenize(sentence);
    const filteredWords = words.filter(word => !this.stopWords.has(word.toLowerCase()));
    
    // Create simplified embedding (in production, use pre-trained embeddings)
    const embedding = this.createSimplifiedEmbedding(filteredWords, context);
    
    // Extract key terms with weights
    const keyTerms = this.extractWeightedTerms(filteredWords, sentence, context);
    
    // Calculate conceptual density
    const conceptualDensity = this.calculateConceptualDensity(filteredWords, context);
    
    // Determine abstraction level
    const abstractionLevel = this.determineAbstractionLevel(sentence, keyTerms);
    
    // Generate topic signature
    const topicSignature = this.generateTopicSignature(keyTerms, context);

    return {
      embedding,
      keyTerms,
      conceptualDensity,
      abstractionLevel,
      topicSignature
    };
  }

  // Calculate semantic similarity between vectors
  public calculateSemanticSimilarity(vec1: SemanticVector, vec2: SemanticVector): number {
    // Cosine similarity for embeddings
    const embeddingSimilarity = this.cosineSimilarity(vec1.embedding, vec2.embedding);
    
    // Term overlap similarity
    const termSimilarity = this.calculateTermOverlap(vec1.keyTerms, vec2.keyTerms);
    
    // Topic signature similarity
    const topicSimilarity = this.calculateTopicSimilarity(vec1.topicSignature, vec2.topicSignature);
    
    // Weighted combination
    return (embeddingSimilarity * 0.5) + (termSimilarity * 0.3) + (topicSimilarity * 0.2);
  }

  // Build semantic coherence graph
  public buildSemanticCoherenceGraph(sentences: string[], context?: AnalysisContext): CoherenceGraph {
    const nodes: SemanticNode[] = [];
    const edges: SemanticEdge[] = [];
    
    // Create nodes for each sentence
    sentences.forEach((sentence, index) => {
      const vector = this.analyzeSentenceSemantics(sentence, context);
      const importance = this.calculateSentenceImportance(sentence, index, sentences.length, context);
      
      nodes.push({
        id: `node-${index}`,
        text: sentence,
        vector,
        importance,
        isMainIdea: importance > 0.7 // Preliminary main idea detection
      });
    });
    
    // Create edges between similar sentences
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const similarity = this.calculateSemanticSimilarity(nodes[i].vector, nodes[j].vector);
        
        if (similarity > 0.3) { // Threshold for meaningful similarity
          const relationshipType = this.determineRelationshipType(nodes[i], nodes[j], similarity);
          
          edges.push({
            fromId: nodes[i].id,
            toId: nodes[j].id,
            similarity,
            relationshipType,
            strength: similarity
          });
        }
      }
    }
    
    // Perform topic clustering
    const topicClusters = this.performTopicClustering(nodes, context);
    
    // Calculate overall coherence
    const coherenceScore = this.calculateOverallCoherence(nodes, edges);
    
    // Identify main topic
    const mainTopicId = this.identifyMainTopic(topicClusters, nodes);

    return {
      nodes,
      edges,
      coherenceScore,
      topicClusters,
      mainTopicId
    };
  }

  // Enhanced main idea detection with semantic analysis
  public detectMainIdeasWithSemantics(text: string, context?: AnalysisContext): EnhancedMainIdeaAnalysis {
    const sentences = this.splitIntoSentences(text);
    const coherenceGraph = this.buildSemanticCoherenceGraph(sentences, context);
    
    // Identify main ideas using multiple factors
    const mainIdeaCandidates = this.identifyMainIdeaCandidates(coherenceGraph, context);
    
    // Select the best main idea
    const primaryIdea = this.selectPrimaryMainIdea(mainIdeaCandidates, coherenceGraph);
    
    // Extract supporting evidence
    const supportingEvidence = this.extractSupportingEvidence(text, primaryIdea, coherenceGraph);
    
    // Build enhanced conceptual framework
    const conceptualFrameworkEnhanced = this.buildConceptualFramework(coherenceGraph, primaryIdea);
    
    // Calculate confidence factors
    const confidenceFactors = this.calculateConfidenceFactors(primaryIdea, coherenceGraph, context);
    
    // Extract key terms with semantic weighting
    const keyTerms = this.extractSemanticKeyTerms(text, primaryIdea, coherenceGraph);
    
    // Generate supporting points
    const supportingPoints = supportingEvidence
      .filter(evidence => evidence.relevanceScore > 0.6)
      .map(evidence => evidence.text)
      .slice(0, 5);

    return {
      primaryIdea: primaryIdea.text,
      supportingPoints,
      keyTerms,
      conceptualFramework: conceptualFrameworkEnhanced.primaryConcepts.join(' → '),
      visualMetaphor: this.generateEnhancedVisualMetaphor(primaryIdea, conceptualFrameworkEnhanced),
      confidence: confidenceFactors.combinedConfidence,
      
      // Enhanced properties
      semanticCoherence: coherenceGraph.coherenceScore,
      topicClusters: coherenceGraph.topicClusters,
      supportingEvidence,
      conceptualFrameworkEnhanced,
      confidenceFactors
    };
  }

  // Private helper methods

  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);
  }

  private createSimplifiedEmbedding(words: string[], context?: AnalysisContext): number[] {
    // Simplified embedding based on word frequencies and domain indicators
    const embedding = new Array(100).fill(0);
    
    words.forEach((word, index) => {
      const hash = this.simpleHash(word) % 100;
      embedding[hash] += 1;
      
      // Boost domain-specific terms
      if (context) {
        const domainBoost = this.getDomainBoost(word, context.documentType);
        embedding[hash] += domainBoost;
      }
    });
    
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? embedding.map(val => val / magnitude) : embedding;
  }

  private extractWeightedTerms(words: string[], sentence: string, context?: AnalysisContext): WeightedTerm[] {
    const termFreq = new Map<string, number>();
    const termPositions = new Map<string, number[]>();
    
    words.forEach((word, index) => {
      termFreq.set(word, (termFreq.get(word) || 0) + 1);
      if (!termPositions.has(word)) termPositions.set(word, []);
      termPositions.get(word)!.push(index);
    });
    
    return Array.from(termFreq.entries()).map(([term, frequency]) => {
      const semanticImportance = this.calculateSemanticImportance(term, sentence, context);
      const weight = frequency * semanticImportance;
      
      return {
        term,
        weight,
        frequency,
        semanticImportance
      };
    }).sort((a, b) => b.weight - a.weight).slice(0, 10);
  }

  private calculateConceptualDensity(words: string[], context?: AnalysisContext): number {
    const conceptWords = words.filter(word => {
      return word.length > 5 || 
             /^[A-Z]/.test(word) || 
             this.isConceptualTerm(word, context);
    });
    
    return words.length > 0 ? conceptWords.length / words.length : 0;
  }

  private determineAbstractionLevel(sentence: string, keyTerms: WeightedTerm[]): 'concrete' | 'abstract' | 'mixed' {
    const concreteIndicators = ['example', 'instance', 'specific', 'particular', 'actual', 'real'];
    const abstractIndicators = ['concept', 'theory', 'principle', 'idea', 'notion', 'framework'];
    
    const lowerSentence = sentence.toLowerCase();
    const concreteScore = concreteIndicators.filter(indicator => lowerSentence.includes(indicator)).length;
    const abstractScore = abstractIndicators.filter(indicator => lowerSentence.includes(indicator)).length;
    
    if (abstractScore > concreteScore) return 'abstract';
    if (concreteScore > abstractScore) return 'concrete';
    return 'mixed';
  }

  private generateTopicSignature(keyTerms: WeightedTerm[], context?: AnalysisContext): string[] {
    return keyTerms
      .filter(term => term.semanticImportance > 0.5)
      .slice(0, 5)
      .map(term => term.term);
  }

  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }

  private calculateTermOverlap(terms1: WeightedTerm[], terms2: WeightedTerm[]): number {
    const set1 = new Set(terms1.map(t => t.term));
    const set2 = new Set(terms2.map(t => t.term));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private calculateTopicSimilarity(topics1: string[], topics2: string[]): number {
    const set1 = new Set(topics1);
    const set2 = new Set(topics2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private calculateSentenceImportance(
    sentence: string, 
    index: number, 
    totalSentences: number, 
    context?: AnalysisContext
  ): number {
    let importance = 0;
    
    // Position-based importance
    if (index === 0) importance += 0.3; // First sentence
    if (index === totalSentences - 1) importance += 0.2; // Last sentence
    
    // Length-based importance (optimal range)
    const wordCount = sentence.split(/\s+/).length;
    if (wordCount >= 10 && wordCount <= 25) importance += 0.2;
    
    // Linguistic markers
    const lowerSentence = sentence.toLowerCase();
    const mainIdeaMarkers = ['main', 'key', 'important', 'primary', 'central', 'fundamental'];
    const markerCount = mainIdeaMarkers.filter(marker => lowerSentence.includes(marker)).length;
    importance += markerCount * 0.1;
    
    // Domain-specific importance
    if (context) {
      importance += this.getDomainImportance(sentence, context);
    }
    
    return Math.min(importance, 1.0);
  }

  private determineRelationshipType(
    node1: SemanticNode, 
    node2: SemanticNode, 
    similarity: number
  ): SemanticEdge['relationshipType'] {
    const text1 = node1.text.toLowerCase();
    const text2 = node2.text.toLowerCase();
    
    // Check for support relationships
    if (text2.includes('for example') || text2.includes('such as')) return 'supports';
    if (text2.includes('however') || text2.includes('but')) return 'contrasts';
    if (text2.includes('therefore') || text2.includes('thus')) return 'follows';
    if (text2.includes('means') || text2.includes('defined as')) return 'defines';
    
    // Default to elaboration for high similarity
    return similarity > 0.7 ? 'elaborates' : 'supports';
  }

  private performTopicClustering(nodes: SemanticNode[], context?: AnalysisContext): TopicCluster[] {
    // Simple clustering based on semantic similarity
    const clusters: TopicCluster[] = [];
    const visited = new Set<string>();
    
    nodes.forEach(node => {
      if (visited.has(node.id)) return;
      
      const cluster: TopicCluster = {
        id: `cluster-${clusters.length}`,
        sentences: [node.text],
        centroid: [...node.vector.embedding],
        coherenceScore: 0,
        mainTopic: node.vector.topicSignature[0] || 'general',
        keywords: node.vector.keyTerms.slice(0, 3).map(t => t.term)
      };
      
      visited.add(node.id);
      
      // Find similar nodes for this cluster
      nodes.forEach(otherNode => {
        if (visited.has(otherNode.id)) return;
        
        const similarity = this.calculateSemanticSimilarity(node.vector, otherNode.vector);
        if (similarity > 0.5) {
          cluster.sentences.push(otherNode.text);
          visited.add(otherNode.id);
          
          // Update centroid (simplified)
          for (let i = 0; i < cluster.centroid.length; i++) {
            cluster.centroid[i] = (cluster.centroid[i] + otherNode.vector.embedding[i]) / 2;
          }
        }
      });
      
      cluster.coherenceScore = this.calculateClusterCoherence(cluster);
      clusters.push(cluster);
    });
    
    return clusters.sort((a, b) => b.coherenceScore - a.coherenceScore);
  }

  private calculateOverallCoherence(nodes: SemanticNode[], edges: SemanticEdge[]): number {
    if (nodes.length <= 1) return 1.0;
    
    const totalPossibleEdges = (nodes.length * (nodes.length - 1)) / 2;
    const actualEdges = edges.length;
    const connectivity = actualEdges / totalPossibleEdges;
    
    const avgSimilarity = edges.length > 0 ? 
      edges.reduce((sum, edge) => sum + edge.similarity, 0) / edges.length : 0;
    
    return (connectivity * 0.4) + (avgSimilarity * 0.6);
  }

  private identifyMainTopic(clusters: TopicCluster[], nodes: SemanticNode[]): string | null {
    if (clusters.length === 0) return null;
    
    // Find cluster with highest coherence and most important nodes
    let bestCluster = clusters[0];
    let bestScore = 0;
    
    clusters.forEach(cluster => {
      const clusterNodes = nodes.filter(node => 
        cluster.sentences.includes(node.text)
      );
      const avgImportance = clusterNodes.reduce((sum, node) => sum + node.importance, 0) / clusterNodes.length;
      const score = cluster.coherenceScore * avgImportance;
      
      if (score > bestScore) {
        bestScore = score;
        bestCluster = cluster;
      }
    });
    
    return bestCluster.id;
  }

  private identifyMainIdeaCandidates(graph: CoherenceGraph, context?: AnalysisContext): SemanticNode[] {
    return graph.nodes
      .filter(node => node.importance > 0.5)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 3);
  }

  private selectPrimaryMainIdea(candidates: SemanticNode[], graph: CoherenceGraph): SemanticNode {
    if (candidates.length === 0) {
      return graph.nodes.reduce((best, current) => 
        current.importance > best.importance ? current : best
      );
    }
    
    // Select based on combination of importance and centrality
    return candidates.reduce((best, current) => {
      const bestCentrality = this.calculateNodeCentrality(best, graph);
      const currentCentrality = this.calculateNodeCentrality(current, graph);
      
      const bestScore = best.importance * 0.7 + bestCentrality * 0.3;
      const currentScore = current.importance * 0.7 + currentCentrality * 0.3;
      
      return currentScore > bestScore ? current : best;
    });
  }

  private extractSupportingEvidence(
    text: string, 
    mainIdea: SemanticNode, 
    graph: CoherenceGraph
  ): SupportingEvidence[] {
    const sentences = this.splitIntoSentences(text);
    const evidence: SupportingEvidence[] = [];
    
    sentences.forEach(sentence => {
      if (sentence === mainIdea.text) return;
      
      const sentenceVector = this.analyzeSentenceSemantics(sentence);
      const semanticDistance = 1 - this.calculateSemanticSimilarity(mainIdea.vector, sentenceVector);
      
      if (semanticDistance < 0.7) { // Related to main idea
        const type = this.classifyEvidenceType(sentence);
        const relevanceScore = this.calculateRelevanceScore(sentence, mainIdea.text);
        const evidenceStrength = this.calculateEvidenceStrength(sentence, type);
        
        evidence.push({
          text: sentence,
          type,
          relevanceScore,
          evidenceStrength,
          semanticDistance
        });
      }
    });
    
    return evidence.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private buildConceptualFramework(graph: CoherenceGraph, mainIdea: SemanticNode): ConceptualFramework {
    const primaryConcepts = mainIdea.vector.keyTerms.slice(0, 3).map(t => t.term);
    
    // Build simple hierarchy
    const conceptHierarchy: ConceptNode[] = primaryConcepts.map((concept, index) => ({
      concept,
      level: index,
      children: [],
      parent: index > 0 ? primaryConcepts[index - 1] : null,
      importance: mainIdea.vector.keyTerms[index]?.weight || 0
    }));
    
    // Create relationships
    const relationshipMap: ConceptRelationship[] = [];
    for (let i = 0; i < primaryConcepts.length - 1; i++) {
      relationshipMap.push({
        from: primaryConcepts[i],
        to: primaryConcepts[i + 1],
        type: 'enables',
        strength: 0.8
      });
    }
    
    return {
      primaryConcepts,
      conceptHierarchy,
      relationshipMap,
      abstractionLevel: mainIdea.vector.abstractionLevel === 'abstract' ? 0.8 : 
                       mainIdea.vector.abstractionLevel === 'mixed' ? 0.5 : 0.2
    };
  }

  private calculateConfidenceFactors(
    mainIdea: SemanticNode, 
    graph: CoherenceGraph, 
    context?: AnalysisContext
  ): ConfidenceFactors {
    const structuralWeight = this.calculateStructuralWeight(mainIdea.text);
    const semanticCentrality = this.calculateNodeCentrality(mainIdea, graph);
    const linguisticMarkers = this.calculateLinguisticMarkers(mainIdea.text);
    const positionWeight = this.calculatePositionWeight(mainIdea.text, graph);
    const coherenceScore = graph.coherenceScore;
    const domainSpecificScore = context ? this.getDomainImportance(mainIdea.text, context) : 0.5;
    
    const combinedConfidence = (
      structuralWeight * 0.2 +
      semanticCentrality * 0.25 +
      linguisticMarkers * 0.15 +
      positionWeight * 0.1 +
      coherenceScore * 0.2 +
      domainSpecificScore * 0.1
    );
    
    return {
      structuralWeight,
      semanticCentrality,
      linguisticMarkers,
      positionWeight,
      coherenceScore,
      domainSpecificScore,
      combinedConfidence: Math.min(combinedConfidence, 1.0)
    };
  }

  private extractSemanticKeyTerms(
    text: string, 
    mainIdea: SemanticNode, 
    graph: CoherenceGraph
  ): string[] {
    const allTerms = new Map<string, number>();
    
    // Collect terms from main idea with high weight
    mainIdea.vector.keyTerms.forEach(term => {
      allTerms.set(term.term, term.weight * 2); // Boost main idea terms
    });
    
    // Collect terms from related nodes
    graph.edges
      .filter(edge => edge.fromId === mainIdea.id || edge.toId === mainIdea.id)
      .forEach(edge => {
        const relatedNodeId = edge.fromId === mainIdea.id ? edge.toId : edge.fromId;
        const relatedNode = graph.nodes.find(n => n.id === relatedNodeId);
        
        if (relatedNode) {
          relatedNode.vector.keyTerms.forEach(term => {
            const currentWeight = allTerms.get(term.term) || 0;
            allTerms.set(term.term, currentWeight + (term.weight * edge.similarity));
          });
        }
      });
    
    return Array.from(allTerms.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([term]) => term);
  }

  private generateEnhancedVisualMetaphor(
    mainIdea: SemanticNode, 
    framework: ConceptualFramework
  ): string {
    const abstractionLevel = framework.abstractionLevel;
    const primaryConcept = framework.primaryConcepts[0] || 'concept';
    
    if (abstractionLevel > 0.7) {
      return `A constellation of interconnected ideas with ${primaryConcept} as the central star`;
    } else if (abstractionLevel > 0.4) {
      return `A bridge connecting concrete examples to abstract principles through ${primaryConcept}`;
    } else {
      return `A detailed blueprint showing how ${primaryConcept} works in practice`;
    }
  }

  // Additional helper methods
  private splitIntoSentences(text: string): string[] {
    return text.split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10);
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private getDomainBoost(word: string, documentType: string): number {
    switch (documentType) {
      case 'academic':
        return this.academicIndicators.has(word) ? 0.5 : 0;
      case 'technical':
        return this.technicalIndicators.has(word) ? 0.5 : 0;
      case 'business':
        return this.businessIndicators.has(word) ? 0.5 : 0;
      default:
        return 0;
    }
  }

  private calculateSemanticImportance(term: string, sentence: string, context?: AnalysisContext): number {
    let importance = 0.5; // Base importance
    
    // Length bonus
    if (term.length > 6) importance += 0.2;
    if (term.length > 10) importance += 0.2;
    
    // Capitalization bonus (proper nouns, important terms)
    if (/^[A-Z]/.test(term)) importance += 0.3;
    
    // Technical term patterns
    if (term.includes('tion') || term.includes('ment') || term.includes('ness')) {
      importance += 0.2;
    }
    
    // Domain-specific importance
    if (context) {
      importance += this.getDomainBoost(term, context.documentType);
    }
    
    return Math.min(importance, 1.0);
  }

  private isConceptualTerm(word: string, context?: AnalysisContext): boolean {
    const conceptualSuffixes = ['tion', 'ment', 'ness', 'ism', 'ity', 'ology'];
    const hasConceptualSuffix = conceptualSuffixes.some(suffix => word.endsWith(suffix));
    
    if (hasConceptualSuffix) return true;
    
    if (context) {
      switch (context.documentType) {
        case 'academic':
          return this.academicIndicators.has(word);
        case 'technical':
          return this.technicalIndicators.has(word);
        case 'business':
          return this.businessIndicators.has(word);
        default:
          return false;
      }
    }
    
    return false;
  }

  private getDomainImportance(sentence: string, context: AnalysisContext): number {
    const lowerSentence = sentence.toLowerCase();
    let importance = 0;
    
    switch (context.documentType) {
      case 'academic':
        const academicTerms = Array.from(this.academicIndicators).filter(term => 
          lowerSentence.includes(term)
        );
        importance = academicTerms.length * 0.1;
        break;
      case 'technical':
        const technicalTerms = Array.from(this.technicalIndicators).filter(term => 
          lowerSentence.includes(term)
        );
        importance = technicalTerms.length * 0.1;
        break;
      case 'business':
        const businessTerms = Array.from(this.businessIndicators).filter(term => 
          lowerSentence.includes(term)
        );
        importance = businessTerms.length * 0.1;
        break;
      default:
        importance = 0;
    }
    
    return Math.min(importance, 0.3);
  }

  private calculateClusterCoherence(cluster: TopicCluster): number {
    if (cluster.sentences.length <= 1) return 1.0;
    
    // Calculate average pairwise similarity within cluster
    let totalSimilarity = 0;
    let pairCount = 0;
    
    for (let i = 0; i < cluster.sentences.length; i++) {
      for (let j = i + 1; j < cluster.sentences.length; j++) {
        const vec1 = this.analyzeSentenceSemantics(cluster.sentences[i]);
        const vec2 = this.analyzeSentenceSemantics(cluster.sentences[j]);
        totalSimilarity += this.calculateSemanticSimilarity(vec1, vec2);
        pairCount++;
      }
    }
    
    return pairCount > 0 ? totalSimilarity / pairCount : 0;
  }

  private calculateNodeCentrality(node: SemanticNode, graph: CoherenceGraph): number {
    const connectedEdges = graph.edges.filter(edge => 
      edge.fromId === node.id || edge.toId === node.id
    );
    
    if (connectedEdges.length === 0) return 0;
    
    const avgSimilarity = connectedEdges.reduce((sum, edge) => sum + edge.similarity, 0) / connectedEdges.length;
    const connectivity = connectedEdges.length / (graph.nodes.length - 1);
    
    return (avgSimilarity * 0.6) + (connectivity * 0.4);
  }

  private classifyEvidenceType(sentence: string): SupportingEvidence['type'] {
    const lowerSentence = sentence.toLowerCase();
    
    if (lowerSentence.includes('for example') || lowerSentence.includes('such as') || 
        lowerSentence.includes('instance')) {
      return 'example';
    }
    
    if (/\d+%|\d+\.\d+|statistics|data shows|research indicates/.test(lowerSentence)) {
      return 'statistic';
    }
    
    if (lowerSentence.includes('"') || lowerSentence.includes('said') || 
        lowerSentence.includes('stated')) {
      return 'quote';
    }
    
    if (lowerSentence.includes('means') || lowerSentence.includes('defined as') || 
        lowerSentence.includes('refers to')) {
      return 'definition';
    }
    
    if (lowerSentence.includes('like') || lowerSentence.includes('similar to') || 
        lowerSentence.includes('as if')) {
      return 'analogy';
    }
    
    return 'explanation';
  }

  private calculateRelevanceScore(supportText: string, mainIdeaText: string): number {
    const supportVector = this.analyzeSentenceSemantics(supportText);
    const mainIdeaVector = this.analyzeSentenceSemantics(mainIdeaText);
    
    const semanticSimilarity = this.calculateSemanticSimilarity(supportVector, mainIdeaVector);
    
    // Boost for explicit connection words
    const connectionWords = ['because', 'since', 'therefore', 'thus', 'for example', 'such as'];
    const hasConnection = connectionWords.some(word => 
      supportText.toLowerCase().includes(word)
    );
    
    const connectionBonus = hasConnection ? 0.2 : 0;
    
    return Math.min(semanticSimilarity + connectionBonus, 1.0);
  }

  private calculateEvidenceStrength(sentence: string, type: SupportingEvidence['type']): number {
    let strength = 0.5; // Base strength
    
    switch (type) {
      case 'statistic':
        // Look for specific numbers, percentages, research citations
        if (/\d+%/.test(sentence)) strength += 0.3;
        if (/research|study|data/.test(sentence.toLowerCase())) strength += 0.2;
        break;
      case 'quote':
        // Direct quotes have high evidential value
        strength += 0.3;
        break;
      case 'definition':
        // Definitions provide strong conceptual support
        strength += 0.25;
        break;
      case 'example':
        // Examples vary in strength based on specificity
        if (sentence.toLowerCase().includes('specific')) strength += 0.2;
        break;
      case 'analogy':
        // Analogies help understanding but have moderate evidential value
        strength += 0.1;
        break;
      default:
        // General explanations
        break;
    }
    
    return Math.min(strength, 1.0);
  }

  private calculateStructuralWeight(text: string): number {
    let weight = 0.5;
    
    // Check for structural indicators
    const structuralMarkers = [
      'introduction', 'conclusion', 'summary', 'overview', 'main point',
      'key concept', 'primary purpose', 'central idea', 'fundamental principle'
    ];
    
    const lowerText = text.toLowerCase();
    const markerCount = structuralMarkers.filter(marker => lowerText.includes(marker)).length;
    
    weight += markerCount * 0.15;
    
    // Position in document (if first or last sentence)
    if (lowerText.includes('first') || lowerText.includes('begin')) weight += 0.1;
    if (lowerText.includes('finally') || lowerText.includes('conclude')) weight += 0.1;
    
    return Math.min(weight, 1.0);
  }

  private calculateLinguisticMarkers(text: string): number {
    let score = 0;
    const lowerText = text.toLowerCase();
    
    // Main idea linguistic markers
    const mainIdeaMarkers = [
      'the main', 'the key', 'the primary', 'the central', 'the fundamental',
      'most important', 'essentially', 'basically', 'in essence', 'the purpose'
    ];
    
    const markerCount = mainIdeaMarkers.filter(marker => lowerText.includes(marker)).length;
    score += markerCount * 0.2;
    
    // Definition markers
    const definitionMarkers = ['is defined as', 'means that', 'refers to', 'can be understood as'];
    const defMarkerCount = definitionMarkers.filter(marker => lowerText.includes(marker)).length;
    score += defMarkerCount * 0.15;
    
    return Math.min(score, 1.0);
  }

  private calculatePositionWeight(text: string, graph: CoherenceGraph): number {
    // Find the position of this text in the graph
    const nodeIndex = graph.nodes.findIndex(node => node.text === text);
    if (nodeIndex === -1) return 0.5;
    
    const totalNodes = graph.nodes.length;
    
    // First and last positions get higher weight
    if (nodeIndex === 0) return 0.8;
    if (nodeIndex === totalNodes - 1) return 0.7;
    
    // Middle positions get moderate weight
    return 0.5;
  }
}

// Export singleton instance
export const enhancedSemanticAnalyzer = new EnhancedSemanticAnalyzer();

// Export main class
export { EnhancedSemanticAnalyzer };
