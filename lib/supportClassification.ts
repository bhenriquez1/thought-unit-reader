/**
 * Supporting Information Classification System
 * Advanced classification and analysis of supporting details for main ideas
 */

import { enhancedSemanticAnalyzer, type SemanticVector, type AnalysisContext } from './enhancedSemanticAnalysis';

export interface SupportClassification {
  text: string;
  type: SupportType;
  subtype: SupportSubtype;
  relevanceScore: number;
  evidenceStrength: number;
  semanticDistance: number;
  supportChain: string[];
  confidenceLevel: 'high' | 'medium' | 'low';
  rhetoricalFunction: RhetoricalFunction;
  logicalConnection: LogicalConnection;
}

export enum SupportType {
  EXAMPLE = 'example',
  EVIDENCE = 'evidence',
  EXPLANATION = 'explanation',
  DEFINITION = 'definition',
  ANALOGY = 'analogy',
  STATISTIC = 'statistic',
  QUOTE = 'quote',
  CONTRADICTION = 'contradiction',
  ELABORATION = 'elaboration',
  CAUSE_EFFECT = 'cause-effect'
}

export enum SupportSubtype {
  // Example subtypes
  CONCRETE_EXAMPLE = 'concrete-example',
  HYPOTHETICAL_EXAMPLE = 'hypothetical-example',
  CASE_STUDY = 'case-study',
  
  // Evidence subtypes
  EMPIRICAL_DATA = 'empirical-data',
  RESEARCH_FINDING = 'research-finding',
  EXPERT_TESTIMONY = 'expert-testimony',
  HISTORICAL_EVIDENCE = 'historical-evidence',
  
  // Explanation subtypes
  PROCESS_EXPLANATION = 'process-explanation',
  CAUSAL_EXPLANATION = 'causal-explanation',
  FUNCTIONAL_EXPLANATION = 'functional-explanation',
  
  // Definition subtypes
  FORMAL_DEFINITION = 'formal-definition',
  OPERATIONAL_DEFINITION = 'operational-definition',
  CONTEXTUAL_DEFINITION = 'contextual-definition',
  
  // Analogy subtypes
  STRUCTURAL_ANALOGY = 'structural-analogy',
  FUNCTIONAL_ANALOGY = 'functional-analogy',
  METAPHORICAL_ANALOGY = 'metaphorical-analogy',
  
  // Other subtypes
  DESCRIPTIVE_STATISTIC = 'descriptive-statistic',
  INFERENTIAL_STATISTIC = 'inferential-statistic',
  DIRECT_QUOTE = 'direct-quote',
  PARAPHRASE = 'paraphrase',
  COUNTERARGUMENT = 'counterargument',
  REFUTATION = 'refutation'
}

export enum RhetoricalFunction {
  CLARIFICATION = 'clarification',
  AMPLIFICATION = 'amplification',
  ILLUSTRATION = 'illustration',
  JUSTIFICATION = 'justification',
  QUALIFICATION = 'qualification',
  CONTRAST = 'contrast',
  COMPARISON = 'comparison',
  EMPHASIS = 'emphasis'
}

export enum LogicalConnection {
  DIRECT_SUPPORT = 'direct-support',
  INDIRECT_SUPPORT = 'indirect-support',
  CAUSAL_LINK = 'causal-link',
  TEMPORAL_SEQUENCE = 'temporal-sequence',
  SPATIAL_RELATIONSHIP = 'spatial-relationship',
  HIERARCHICAL = 'hierarchical',
  PARALLEL = 'parallel',
  CONTRADICTORY = 'contradictory'
}

export interface ClassificationMetrics {
  overallAccuracy: number;
  typeAccuracy: { [key in SupportType]: number };
  subtypeAccuracy: { [key in SupportSubtype]: number };
  averageConfidence: number;
  processingTime: number;
}

export interface SupportAnalysisResult {
  classifications: SupportClassification[];
  mainIdeaSupport: MainIdeaSupport;
  supportNetwork: SupportNetwork;
  qualityMetrics: QualityMetrics;
  recommendations: string[];
}

export interface MainIdeaSupport {
  totalSupportingElements: number;
  strongSupport: SupportClassification[];
  moderateSupport: SupportClassification[];
  weakSupport: SupportClassification[];
  contradictoryElements: SupportClassification[];
  supportCoverage: number; // 0-1 how well the main idea is supported
}

export interface SupportNetwork {
  nodes: SupportNode[];
  connections: SupportConnection[];
  clusters: SupportCluster[];
  centralityScores: { [nodeId: string]: number };
}

export interface SupportNode {
  id: string;
  classification: SupportClassification;
  importance: number;
  connections: string[];
}

export interface SupportConnection {
  fromId: string;
  toId: string;
  connectionType: LogicalConnection;
  strength: number;
}

export interface SupportCluster {
  id: string;
  theme: string;
  supportElements: string[];
  coherenceScore: number;
  mainFunction: RhetoricalFunction;
}

export interface QualityMetrics {
  diversityScore: number; // Variety of support types
  depthScore: number; // How detailed the support is
  credibilityScore: number; // Quality of evidence
  coherenceScore: number; // How well support fits together
  completenessScore: number; // Coverage of main idea aspects
}

class SupportClassificationEngine {
  private typeIndicators = new Map<SupportType, string[]>([
    [SupportType.EXAMPLE, [
      'for example', 'such as', 'for instance', 'to illustrate', 'consider',
      'imagine', 'suppose', 'let\'s say', 'case in point', 'take the case of'
    ]],
    [SupportType.EVIDENCE, [
      'research shows', 'studies indicate', 'data reveals', 'findings suggest',
      'evidence demonstrates', 'results show', 'according to', 'based on'
    ]],
    [SupportType.EXPLANATION, [
      'this means', 'in other words', 'that is to say', 'specifically',
      'more precisely', 'to clarify', 'to elaborate', 'furthermore'
    ]],
    [SupportType.DEFINITION, [
      'is defined as', 'means', 'refers to', 'is understood as',
      'can be described as', 'is characterized by', 'involves'
    ]],
    [SupportType.ANALOGY, [
      'like', 'similar to', 'analogous to', 'comparable to', 'just as',
      'in the same way', 'likewise', 'by analogy', 'resembles'
    ]],
    [SupportType.STATISTIC, [
      'percent', '%', 'statistics show', 'data indicates', 'survey found',
      'study revealed', 'research demonstrates', 'analysis shows'
    ]],
    [SupportType.QUOTE, [
      'said', 'stated', 'according to', 'as noted by', 'observed',
      'remarked', 'commented', 'explained', 'argued'
    ]],
    [SupportType.CONTRADICTION, [
      'however', 'but', 'nevertheless', 'on the contrary', 'conversely',
      'in contrast', 'alternatively', 'yet', 'although'
    ]]
  ]);

  private rhetoricalMarkers = new Map<RhetoricalFunction, string[]>([
    [RhetoricalFunction.CLARIFICATION, [
      'to clarify', 'in other words', 'that is', 'specifically', 'namely'
    ]],
    [RhetoricalFunction.AMPLIFICATION, [
      'furthermore', 'moreover', 'additionally', 'also', 'in addition'
    ]],
    [RhetoricalFunction.ILLUSTRATION, [
      'for example', 'to illustrate', 'for instance', 'such as'
    ]],
    [RhetoricalFunction.JUSTIFICATION, [
      'because', 'since', 'due to', 'as a result of', 'therefore'
    ]],
    [RhetoricalFunction.QUALIFICATION, [
      'however', 'although', 'while', 'despite', 'nevertheless'
    ]],
    [RhetoricalFunction.CONTRAST, [
      'in contrast', 'on the other hand', 'conversely', 'whereas'
    ]],
    [RhetoricalFunction.COMPARISON, [
      'similarly', 'likewise', 'in the same way', 'comparable to'
    ]],
    [RhetoricalFunction.EMPHASIS, [
      'importantly', 'significantly', 'notably', 'particularly', 'especially'
    ]]
  ]);

  // Main classification method
  public classifySupport(
    supportText: string, 
    mainIdeaText: string, 
    context?: AnalysisContext
  ): SupportClassification {
    // Analyze semantic properties
    const supportVector = enhancedSemanticAnalyzer.analyzeSentenceSemantics(supportText, context);
    const mainIdeaVector = enhancedSemanticAnalyzer.analyzeSentenceSemantics(mainIdeaText, context);
    
    // Classify primary type
    const type = this.classifyPrimaryType(supportText);
    
    // Classify subtype
    const subtype = this.classifySubtype(supportText, type);
    
    // Calculate relevance and evidence strength
    const relevanceScore = this.calculateRelevanceScore(supportText, mainIdeaText, supportVector, mainIdeaVector);
    const evidenceStrength = this.calculateEvidenceStrength(supportText, type, subtype);
    const semanticDistance = 1 - enhancedSemanticAnalyzer.calculateSemanticSimilarity(supportVector, mainIdeaVector);
    
    // Build support chain
    const supportChain = this.buildSupportChain(supportText, mainIdeaText);
    
    // Determine confidence level
    const confidenceLevel = this.determineConfidenceLevel(relevanceScore, evidenceStrength, semanticDistance);
    
    // Identify rhetorical function
    const rhetoricalFunction = this.identifyRhetoricalFunction(supportText);
    
    // Determine logical connection
    const logicalConnection = this.determineLogicalConnection(supportText, mainIdeaText, type);

    return {
      text: supportText,
      type,
      subtype,
      relevanceScore,
      evidenceStrength,
      semanticDistance,
      supportChain,
      confidenceLevel,
      rhetoricalFunction,
      logicalConnection
    };
  }

  // Comprehensive support analysis
  public analyzeSupportingInformation(
    supportTexts: string[],
    mainIdeaText: string,
    context?: AnalysisContext
  ): SupportAnalysisResult {
    const startTime = Date.now();
    
    // Classify all supporting elements
    const classifications = supportTexts.map(text => 
      this.classifySupport(text, mainIdeaText, context)
    );
    
    // Analyze main idea support
    const mainIdeaSupport = this.analyzeMainIdeaSupport(classifications);
    
    // Build support network
    const supportNetwork = this.buildSupportNetwork(classifications);
    
    // Calculate quality metrics
    const qualityMetrics = this.calculateQualityMetrics(classifications, mainIdeaSupport);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(classifications, qualityMetrics);
    
    const processingTime = Date.now() - startTime;
    
    return {
      classifications,
      mainIdeaSupport,
      supportNetwork,
      qualityMetrics,
      recommendations
    };
  }

  // Private classification methods

  private classifyPrimaryType(text: string): SupportType {
    const lowerText = text.toLowerCase();
    const scores = new Map<SupportType, number>();
    
    // Initialize scores
    Object.values(SupportType).forEach(type => scores.set(type, 0));
    
    // Score based on indicators
    this.typeIndicators.forEach((indicators, type) => {
      const matchCount = indicators.filter(indicator => 
        lowerText.includes(indicator.toLowerCase())
      ).length;
      scores.set(type, matchCount);
    });
    
    // Additional pattern-based scoring
    this.addPatternBasedScoring(lowerText, scores);
    
    // Find highest scoring type
    let bestType = SupportType.EXPLANATION; // Default
    let bestScore = 0;
    
    scores.forEach((score, type) => {
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    });
    
    return bestType;
  }

  private addPatternBasedScoring(lowerText: string, scores: Map<SupportType, number>): void {
    // Statistical patterns
    if (/\d+%|\d+\.\d+|\d+,\d+/.test(lowerText)) {
      scores.set(SupportType.STATISTIC, scores.get(SupportType.STATISTIC)! + 2);
    }
    
    // Quote patterns
    if (/"[^"]*"|'[^']*'/.test(lowerText)) {
      scores.set(SupportType.QUOTE, scores.get(SupportType.QUOTE)! + 2);
    }
    
    // Research patterns
    if (/study|research|experiment|survey|analysis/.test(lowerText)) {
      scores.set(SupportType.EVIDENCE, scores.get(SupportType.EVIDENCE)! + 1);
    }
    
    // Definition patterns
    if (/is|are|means|refers to|defined as/.test(lowerText)) {
      scores.set(SupportType.DEFINITION, scores.get(SupportType.DEFINITION)! + 1);
    }
    
    // Causal patterns
    if (/because|since|due to|as a result|therefore|thus/.test(lowerText)) {
      scores.set(SupportType.CAUSE_EFFECT, scores.get(SupportType.CAUSE_EFFECT)! + 1);
    }
  }

  private classifySubtype(text: string, primaryType: SupportType): SupportSubtype {
    const lowerText = text.toLowerCase();
    
    switch (primaryType) {
      case SupportType.EXAMPLE:
        if (lowerText.includes('imagine') || lowerText.includes('suppose')) {
          return SupportSubtype.HYPOTHETICAL_EXAMPLE;
        }
        if (lowerText.includes('case study') || lowerText.includes('case of')) {
          return SupportSubtype.CASE_STUDY;
        }
        return SupportSubtype.CONCRETE_EXAMPLE;
        
      case SupportType.EVIDENCE:
        if (/research|study|experiment/.test(lowerText)) {
          return SupportSubtype.RESEARCH_FINDING;
        }
        if (/expert|authority|according to/.test(lowerText)) {
          return SupportSubtype.EXPERT_TESTIMONY;
        }
        if (/historical|history|past/.test(lowerText)) {
          return SupportSubtype.HISTORICAL_EVIDENCE;
        }
        return SupportSubtype.EMPIRICAL_DATA;
        
      case SupportType.EXPLANATION:
        if (/process|step|procedure/.test(lowerText)) {
          return SupportSubtype.PROCESS_EXPLANATION;
        }
        if (/because|cause|result/.test(lowerText)) {
          return SupportSubtype.CAUSAL_EXPLANATION;
        }
        return SupportSubtype.FUNCTIONAL_EXPLANATION;
        
      case SupportType.DEFINITION:
        if (lowerText.includes('formally') || lowerText.includes('technically')) {
          return SupportSubtype.FORMAL_DEFINITION;
        }
        if (lowerText.includes('operationally') || lowerText.includes('in practice')) {
          return SupportSubtype.OPERATIONAL_DEFINITION;
        }
        return SupportSubtype.CONTEXTUAL_DEFINITION;
        
      case SupportType.ANALOGY:
        if (/structure|form|shape/.test(lowerText)) {
          return SupportSubtype.STRUCTURAL_ANALOGY;
        }
        if (/function|work|operate/.test(lowerText)) {
          return SupportSubtype.FUNCTIONAL_ANALOGY;
        }
        return SupportSubtype.METAPHORICAL_ANALOGY;
        
      case SupportType.STATISTIC:
        if (/mean|average|median|correlation/.test(lowerText)) {
          return SupportSubtype.INFERENTIAL_STATISTIC;
        }
        return SupportSubtype.DESCRIPTIVE_STATISTIC;
        
      case SupportType.QUOTE:
        if (/"[^"]*"/.test(text)) {
          return SupportSubtype.DIRECT_QUOTE;
        }
        return SupportSubtype.PARAPHRASE;
        
      case SupportType.CONTRADICTION:
        if (/refute|disprove|counter/.test(lowerText)) {
          return SupportSubtype.REFUTATION;
        }
        return SupportSubtype.COUNTERARGUMENT;
        
      default:
        return SupportSubtype.CONCRETE_EXAMPLE; // Fallback
    }
  }

  private calculateRelevanceScore(
    supportText: string,
    mainIdeaText: string,
    supportVector: SemanticVector,
    mainIdeaVector: SemanticVector
  ): number {
    // Base semantic similarity
    let relevance = enhancedSemanticAnalyzer.calculateSemanticSimilarity(supportVector, mainIdeaVector);
    
    // Boost for explicit connection words
    const connectionWords = [
      'because', 'since', 'therefore', 'thus', 'for example', 'such as',
      'this shows', 'this demonstrates', 'this illustrates', 'this proves'
    ];
    
    const lowerSupport = supportText.toLowerCase();
    const connectionCount = connectionWords.filter(word => lowerSupport.includes(word)).length;
    relevance += connectionCount * 0.1;
    
    // Boost for shared key terms
    const supportTerms = new Set(supportVector.keyTerms.map(t => t.term.toLowerCase()));
    const mainIdeaTerms = new Set(mainIdeaVector.keyTerms.map(t => t.term.toLowerCase()));
    const sharedTerms = new Set([...supportTerms].filter(x => mainIdeaTerms.has(x)));
    
    const termOverlap = sharedTerms.size / Math.max(supportTerms.size, mainIdeaTerms.size);
    relevance += termOverlap * 0.2;
    
    // Penalty for contradictory indicators
    const contradictoryWords = ['however', 'but', 'although', 'despite', 'nevertheless'];
    const contradictionCount = contradictoryWords.filter(word => lowerSupport.includes(word)).length;
    relevance -= contradictionCount * 0.1;
    
    return Math.max(0, Math.min(1, relevance));
  }

  private calculateEvidenceStrength(text: string, type: SupportType, subtype: SupportSubtype): number {
    let strength = 0.5; // Base strength
    
    // Type-based strength
    const typeStrengths = new Map<SupportType, number>([
      [SupportType.EVIDENCE, 0.8],
      [SupportType.STATISTIC, 0.9],
      [SupportType.QUOTE, 0.7],
      [SupportType.DEFINITION, 0.6],
      [SupportType.EXAMPLE, 0.5],
      [SupportType.ANALOGY, 0.4],
      [SupportType.EXPLANATION, 0.6],
      [SupportType.CONTRADICTION, 0.3],
      [SupportType.ELABORATION, 0.5],
      [SupportType.CAUSE_EFFECT, 0.7]
    ]);
    
    strength = typeStrengths.get(type) || 0.5;
    
    // Subtype adjustments
    switch (subtype) {
      case SupportSubtype.RESEARCH_FINDING:
      case SupportSubtype.EMPIRICAL_DATA:
        strength += 0.2;
        break;
      case SupportSubtype.EXPERT_TESTIMONY:
        strength += 0.15;
        break;
      case SupportSubtype.DIRECT_QUOTE:
        strength += 0.1;
        break;
      case SupportSubtype.HYPOTHETICAL_EXAMPLE:
        strength -= 0.1;
        break;
    }
    
    // Content-based adjustments
    const lowerText = text.toLowerCase();
    
    // Boost for specific numbers and data
    if (/\d+%|\d+\.\d+/.test(text)) strength += 0.1;
    
    // Boost for authoritative sources
    if (/university|professor|expert|authority/.test(lowerText)) strength += 0.1;
    
    // Boost for recent/current information
    if (/recent|current|latest|new/.test(lowerText)) strength += 0.05;
    
    // Penalty for vague language
    if (/maybe|perhaps|possibly|might|could/.test(lowerText)) strength -= 0.1;
    
    return Math.max(0.1, Math.min(1.0, strength));
  }

  private buildSupportChain(supportText: string, mainIdeaText: string): string[] {
    const chain: string[] = [];
    
    // Extract logical connectors
    const connectors = [
      'because', 'since', 'therefore', 'thus', 'as a result',
      'for example', 'such as', 'this shows', 'this means'
    ];
    
    const lowerSupport = supportText.toLowerCase();
    const foundConnectors = connectors.filter(connector => 
      lowerSupport.includes(connector)
    );
    
    if (foundConnectors.length > 0) {
      chain.push(`Connection: ${foundConnectors[0]}`);
    }
    
    // Add semantic relationship
    const supportVector = enhancedSemanticAnalyzer.analyzeSentenceSemantics(supportText);
    const mainIdeaVector = enhancedSemanticAnalyzer.analyzeSentenceSemantics(mainIdeaText);
    const similarity = enhancedSemanticAnalyzer.calculateSemanticSimilarity(supportVector, mainIdeaVector);
    
    if (similarity > 0.7) {
      chain.push('Strong semantic connection');
    } else if (similarity > 0.4) {
      chain.push('Moderate semantic connection');
    } else {
      chain.push('Weak semantic connection');
    }
    
    return chain;
  }

  private determineConfidenceLevel(
    relevanceScore: number,
    evidenceStrength: number,
    semanticDistance: number
  ): 'high' | 'medium' | 'low' {
    const combinedScore = (relevanceScore * 0.4) + (evidenceStrength * 0.4) + ((1 - semanticDistance) * 0.2);
    
    if (combinedScore >= 0.7) return 'high';
    if (combinedScore >= 0.5) return 'medium';
    return 'low';
  }

  private identifyRhetoricalFunction(text: string): RhetoricalFunction {
    const lowerText = text.toLowerCase();
    const scores = new Map<RhetoricalFunction, number>();
    
    // Initialize scores
    Object.values(RhetoricalFunction).forEach(func => scores.set(func, 0));
    
    // Score based on markers
    this.rhetoricalMarkers.forEach((markers, func) => {
      const matchCount = markers.filter(marker => 
        lowerText.includes(marker.toLowerCase())
      ).length;
      scores.set(func, matchCount);
    });
    
    // Find highest scoring function
    let bestFunction = RhetoricalFunction.CLARIFICATION; // Default
    let bestScore = 0;
    
    scores.forEach((score, func) => {
      if (score > bestScore) {
        bestScore = score;
        bestFunction = func;
      }
    });
    
    return bestFunction;
  }

  private determineLogicalConnection(
    supportText: string,
    mainIdeaText: string,
    type: SupportType
  ): LogicalConnection {
    const lowerSupport = supportText.toLowerCase();
    
    // Check for explicit logical markers
    if (/because|since|due to/.test(lowerSupport)) {
      return LogicalConnection.CAUSAL_LINK;
    }
    
    if (/first|then|next|finally|before|after/.test(lowerSupport)) {
      return LogicalConnection.TEMPORAL_SEQUENCE;
    }
    
    if (/above|below|near|adjacent|within/.test(lowerSupport)) {
      return LogicalConnection.SPATIAL_RELATIONSHIP;
    }
    
    if (/however|but|although|despite/.test(lowerSupport)) {
      return LogicalConnection.CONTRADICTORY;
    }
    
    if (/similarly|likewise|also|additionally/.test(lowerSupport)) {
      return LogicalConnection.PARALLEL;
    }
    
    // Type-based defaults
    switch (type) {
      case SupportType.EXAMPLE:
      case SupportType.EVIDENCE:
        return LogicalConnection.DIRECT_SUPPORT;
      case SupportType.EXPLANATION:
      case SupportType.ELABORATION:
        return LogicalConnection.INDIRECT_SUPPORT;
      case SupportType.CAUSE_EFFECT:
        return LogicalConnection.CAUSAL_LINK;
      case SupportType.CONTRADICTION:
        return LogicalConnection.CONTRADICTORY;
      default:
        return LogicalConnection.DIRECT_SUPPORT;
    }
  }

  private analyzeMainIdeaSupport(classifications: SupportClassification[]): MainIdeaSupport {
    const strongSupport = classifications.filter(c => c.confidenceLevel === 'high');
    const moderateSupport = classifications.filter(c => c.confidenceLevel === 'medium');
    const weakSupport = classifications.filter(c => c.confidenceLevel === 'low');
    const contradictoryElements = classifications.filter(c => c.type === SupportType.CONTRADICTION);
    
    // Calculate support coverage
    const totalRelevance = classifications.reduce((sum, c) => sum + c.relevanceScore, 0);
    const supportCoverage = classifications.length > 0 ? totalRelevance / classifications.length : 0;
    
    return {
      totalSupportingElements: classifications.length,
      strongSupport,
      moderateSupport,
      weakSupport,
      contradictoryElements,
      supportCoverage
    };
  }

  private buildSupportNetwork(classifications: SupportClassification[]): SupportNetwork {
    const nodes: SupportNode[] = classifications.map((classification, index) => ({
      id: `support-${index}`,
      classification,
      importance: classification.relevanceScore * classification.evidenceStrength,
      connections: []
    }));
    
    const connections: SupportConnection[] = [];
    const clusters: SupportCluster[] = [];
    const centralityScores: { [nodeId: string]: number } = {};
    
    // Build connections between related support elements
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const similarity = this.calculateSupportSimilarity(
          nodes[i].classification,
          nodes[j].classification
        );
        
        if (similarity > 0.3) {
          const connectionType = this.determineConnectionType(
            nodes[i].classification,
            nodes[j].classification
          );
          
          connections.push({
            fromId: nodes[i].id,
            toId: nodes[j].id,
            connectionType,
            strength: similarity
          });
          
          nodes[i].connections.push(nodes[j].id);
          nodes[j].connections.push(nodes[i].id);
        }
      }
    }
    
    // Calculate centrality scores
    nodes.forEach(node => {
      centralityScores[node.id] = node.connections.length / Math.max(nodes.length - 1, 1);
    });
    
    // Create clusters based on support types and functions
    const typeGroups = new Map<SupportType, SupportNode[]>();
    nodes.forEach(node => {
      const type = node.classification.type;
      if (!typeGroups.has(type)) typeGroups.set(type, []);
      typeGroups.get(type)!.push(node);
    });
    
    typeGroups.forEach((groupNodes, type) => {
      if (groupNodes.length > 1) {
        const coherenceScore = this.calculateClusterCoherence(groupNodes);
        clusters.push({
          id: `cluster-${type}`,
          theme: type,
          supportElements: groupNodes.map(n => n.id),
          coherenceScore,
          mainFunction: groupNodes[0].classification.rhetoricalFunction
        });
      }
    });
    
    return {
      nodes,
      connections,
      clusters,
      centralityScores
    };
  }

  private calculateQualityMetrics(
    classifications: SupportClassification[],
    mainIdeaSupport: MainIdeaSupport
  ): QualityMetrics {
    // Diversity: variety of support types
    const uniqueTypes = new Set(classifications.map(c => c.type));
    const diversityScore = Math.min(uniqueTypes.size / 5, 1); // Normalize to max 5 types
    
    // Depth: average evidence strength
    const depthScore = classifications.length > 0 ?
      classifications.reduce((sum, c) => sum + c.evidenceStrength, 0) / classifications.length : 0;
    
    // Credibility: proportion of high-strength evidence
    const highStrengthCount = classifications.filter(c => c.evidenceStrength > 0.7).length;
    const credibilityScore = classifications.length > 0 ? highStrengthCount / classifications.length : 0;
    
    // Coherence: average relevance score
    const coherenceScore = mainIdeaSupport.supportCoverage;
    
    // Completeness: coverage of different rhetorical functions
    const uniqueFunctions = new Set(classifications.map(c => c.rhetoricalFunction));
    const completenessScore = Math.min(uniqueFunctions.size / 4, 1); // Normalize to max 4 functions
    
    return {
      diversityScore,
      depthScore,
      credibilityScore,
      coherenceScore,
      completenessScore
    };
  }

  private generateRecommendations(
    classifications: SupportClassification[],
    qualityMetrics: QualityMetrics
  ): string[] {
    const recommendations: string[] = [];
    
    if (qualityMetrics.diversityScore < 0.6) {
      recommendations.push('Consider adding more diverse types of supporting evidence (examples, statistics, expert opinions)');
    }
    
    if (qualityMetrics.credibilityScore < 0.5) {
      recommendations.push('Strengthen evidence with more authoritative sources and specific data');
    }
    
    if (qualityMetrics.coherenceScore < 0.6) {
      recommendations.push('Improve logical connections between supporting details and main idea');
    }
    
    if (qualityMetrics.completenessScore < 0.5) {
      recommendations.push('Add supporting details that serve different rhetorical functions (clarification, illustration, justification)');
    }
    
    const weakSupport = classifications.filter(c => c.confidenceLevel === 'low');
    if (weakSupport.length > classifications.length * 0.3) {
      recommendations.push('Consider strengthening or removing weak supporting details that may confuse the main message');
    }
    
    // Check for missing evidence types
    const hasStatistics = classifications.some(c => c.type === SupportType.STATISTIC);
    const hasExamples = classifications.some(c => c.type === SupportType.EXAMPLE);
    const hasEvidence = classifications.some(c => c.type === SupportType.EVIDENCE);
    
    if (!hasStatistics && qualityMetrics.credibilityScore < 0.7) {
      recommendations.push('Add statistical data or research findings to strengthen credibility');
    }
    
    if (!hasExamples && qualityMetrics.completenessScore < 0.6) {
      recommendations.push('Include concrete examples to make abstract concepts more accessible');
    }
    
    if (!hasEvidence && qualityMetrics.credibilityScore < 0.6) {
      recommendations.push('Add empirical evidence or expert testimony to support claims');
    }
    
    return recommendations;
  }

  // Additional helper methods

  private calculateSupportSimilarity(
    classification1: SupportClassification,
    classification2: SupportClassification
  ): number {
    let similarity = 0;
    
    // Type similarity
    if (classification1.type === classification2.type) {
      similarity += 0.4;
    }
    
    // Subtype similarity
    if (classification1.subtype === classification2.subtype) {
      similarity += 0.2;
    }
    
    // Rhetorical function similarity
    if (classification1.rhetoricalFunction === classification2.rhetoricalFunction) {
      similarity += 0.2;
    }
    
    // Semantic similarity
    const vector1 = enhancedSemanticAnalyzer.analyzeSentenceSemantics(classification1.text);
    const vector2 = enhancedSemanticAnalyzer.analyzeSentenceSemantics(classification2.text);
    const semanticSim = enhancedSemanticAnalyzer.calculateSemanticSimilarity(vector1, vector2);
    similarity += semanticSim * 0.2;
    
    return similarity;
  }

  private determineConnectionType(
    classification1: SupportClassification,
    classification2: SupportClassification
  ): LogicalConnection {
    // If both have the same logical connection, use that
    if (classification1.logicalConnection === classification2.logicalConnection) {
      return classification1.logicalConnection;
    }
    
    // If one is causal and the other is temporal, use causal
    if (classification1.logicalConnection === LogicalConnection.CAUSAL_LINK ||
        classification2.logicalConnection === LogicalConnection.CAUSAL_LINK) {
      return LogicalConnection.CAUSAL_LINK;
    }
    
    // If both are support types, use direct support
    if ((classification1.type === SupportType.EXAMPLE || classification1.type === SupportType.EVIDENCE) &&
        (classification2.type === SupportType.EXAMPLE || classification2.type === SupportType.EVIDENCE)) {
      return LogicalConnection.DIRECT_SUPPORT;
    }
    
    // Default to parallel
    return LogicalConnection.PARALLEL;
  }

  private calculateClusterCoherence(nodes: SupportNode[]): number {
    if (nodes.length <= 1) return 1.0;
    
    let totalSimilarity = 0;
    let pairCount = 0;
    
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const similarity = this.calculateSupportSimilarity(
          nodes[i].classification,
          nodes[j].classification
        );
        totalSimilarity += similarity;
        pairCount++;
      }
    }
    
    return pairCount > 0 ? totalSimilarity / pairCount : 0;
  }
}

// Export singleton instance
export const supportClassificationEngine = new SupportClassificationEngine();

// Export main class
export { SupportClassificationEngine };
