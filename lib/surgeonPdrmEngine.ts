/**
 * Surgeon-View PDRM Butler 2.1 Engine
 * Fused pipeline combining PDRM 2.0 with Surgeon-View overlays and Butler actions
 */

import { enhancedHybridAnalysisEngine, type ComprehensiveAnalysisResult } from './enhancedHybridAnalysis';
import { getPatternById, DAT_PATTERNS, type Pattern } from '@/types/patterns';
import { type ThoughtUnit } from './thoughtUnitExtraction';
import { generateMnemonic } from './mnemonicAI';

// Core Surgeon-View Types
export type PDRM = 'P'|'D'|'R'|'M'
export type Timeline = 'PreOp'|'IntraOp'|'PostOp'
export type DecisionNode = 'stabilize'|'diagnose'|'treat'|'monitor'
export type SurgeonAction = 'explain'|'compare'|'quiz'|'mnemonic'|'timeline'|'diagram'

export interface Axis {
  system?: string;
  organ?: string;
  tissue?: string;
  cell?: string;
  molecule?: string;
}

export interface SurgeonUnit {
  unit_id: string;
  text: string;
  anchors: { page: number; para?: number };
  pdrm?: PDRM;
  surgeon: {
    axis: Axis;
    timeline: Timeline;
    decision_node: DecisionNode;
  };
  cue_words: string[];
  evidence_score: number;
  needs_action: SurgeonAction[];
  prereqs: string[];
  dependencies: string[];
}

export interface ButlerAction {
  type: SurgeonAction;
  payload: any;
  anchors: { page: number; para?: number };
  confidence: number;
  reasoning: string;
}

export interface SurgeonRule {
  if: {
    pdrm?: PDRM;
    'surgeon.axis.system'?: string;
    'surgeon.axis.organ'?: string;
    'surgeon.axis.tissue'?: string;
    cue_words?: string[];
    evidence_score?: number;
    [key: string]: any;
  };
  then_actions: SurgeonAction[];
  confidence: number;
}

export interface FusedAnalysisResult {
  units: SurgeonUnit[];
  actions: ButlerAction[];
  rules: SurgeonRule[];
  confidence: number;
}

// NoteLab Export Interfaces
export interface NoteLabExport {
  id: string;
  type: 'thought-unit' | 'butler-action';
  title: string;
  content: string;
  tags: string[];
  anchors: { page: number; para?: number };
  created_at: string;
  pdrm_data?: {
    category: PDRM;
    axis: Axis;
    timeline: Timeline;
    decision_node: DecisionNode;
  };
}

export interface MemoCardExport {
  title: string;
  body: string;
  tags: string[];
  anchors: { page: number; para?: number };
  created_at: string;
  metadata: {
    source: 'surgeon-view-pdrm';
    type: 'thought-unit' | 'butler-action';
    confidence: number;
  };
}

class SurgeonPdrmEngine {
  private analysisCache = new Map<string, ComprehensiveAnalysisResult>();
  
  // Universal Knowledge Mapping Database (covers all subjects)
  private knowledgeRules = new Map<string, Axis>([
    // MEDICAL/ANATOMICAL
    ['neural crest', { system: 'Biology', organ: 'Nervous System', tissue: 'Neural crest' }],
    ['spinal cord', { system: 'Biology', organ: 'Nervous System', tissue: 'Spinal cord' }],
    ['heart', { system: 'Biology', organ: 'Cardiovascular', tissue: 'Heart' }],
    ['neuron', { system: 'Biology', organ: 'Nervous System', cell: 'Neuron' }],
    ['dna', { system: 'Biology', organ: 'Cell Biology', molecule: 'DNA' }],
    ['protein', { system: 'Biology', organ: 'Biochemistry', molecule: 'Protein' }],
    
    // MATHEMATICS
    ['derivative', { system: 'Mathematics', organ: 'Calculus', tissue: 'Differentiation' }],
    ['integral', { system: 'Mathematics', organ: 'Calculus', tissue: 'Integration' }],
    ['matrix', { system: 'Mathematics', organ: 'Linear Algebra', tissue: 'Matrix Operations' }],
    ['polynomial', { system: 'Mathematics', organ: 'Algebra', tissue: 'Polynomial Functions' }],
    ['theorem', { system: 'Mathematics', tissue: 'Mathematical Proof' }],
    ['equation', { system: 'Mathematics', tissue: 'Mathematical Expression' }],
    
    // PHYSICS
    ['force', { system: 'Physics', organ: 'Mechanics', tissue: 'Force and Motion' }],
    ['energy', { system: 'Physics', organ: 'Thermodynamics', tissue: 'Energy Systems' }],
    ['wave', { system: 'Physics', organ: 'Wave Physics', tissue: 'Wave Properties' }],
    ['electron', { system: 'Physics', organ: 'Atomic Physics', cell: 'Subatomic Particle' }],
    ['photon', { system: 'Physics', organ: 'Quantum Physics', molecule: 'Light Particle' }],
    
    // CHEMISTRY
    ['atom', { system: 'Chemistry', organ: 'Atomic Structure', cell: 'Atom' }],
    ['bond', { system: 'Chemistry', organ: 'Chemical Bonding', tissue: 'Molecular Bonds' }],
    ['reaction', { system: 'Chemistry', organ: 'Chemical Reactions', tissue: 'Reaction Mechanisms' }],
    ['catalyst', { system: 'Chemistry', organ: 'Reaction Kinetics', molecule: 'Catalyst' }],
    ['solution', { system: 'Chemistry', organ: 'Solutions', tissue: 'Chemical Mixtures' }],
    
    // COMPUTER SCIENCE
    ['algorithm', { system: 'Computer Science', organ: 'Programming', tissue: 'Algorithm Design' }],
    ['function', { system: 'Computer Science', organ: 'Programming', tissue: 'Function Definition' }],
    ['database', { system: 'Computer Science', organ: 'Data Management', tissue: 'Database Systems' }],
    ['network', { system: 'Computer Science', organ: 'Networking', tissue: 'Network Architecture' }],
    ['variable', { system: 'Computer Science', organ: 'Programming', cell: 'Data Storage' }],
    
    // ECONOMICS
    ['supply', { system: 'Economics', organ: 'Market Theory', tissue: 'Supply and Demand' }],
    ['demand', { system: 'Economics', organ: 'Market Theory', tissue: 'Consumer Behavior' }],
    ['inflation', { system: 'Economics', organ: 'Macroeconomics', tissue: 'Price Level Changes' }],
    ['gdp', { system: 'Economics', organ: 'National Accounts', tissue: 'Economic Indicators' }],
    ['market', { system: 'Economics', organ: 'Market Structure', tissue: 'Economic Markets' }],
    
    // HISTORY
    ['revolution', { system: 'History', organ: 'Political Change', tissue: 'Social Movements' }],
    ['empire', { system: 'History', organ: 'Political Systems', tissue: 'Imperial Structure' }],
    ['treaty', { system: 'History', organ: 'Diplomacy', tissue: 'International Agreements' }],
    ['constitution', { system: 'History', organ: 'Government', tissue: 'Legal Framework' }],
    
    // LITERATURE
    ['metaphor', { system: 'Literature', organ: 'Literary Devices', tissue: 'Figurative Language' }],
    ['plot', { system: 'Literature', organ: 'Narrative Structure', tissue: 'Story Elements' }],
    ['character', { system: 'Literature', organ: 'Narrative Elements', cell: 'Literary Character' }],
    ['theme', { system: 'Literature', organ: 'Literary Analysis', tissue: 'Central Ideas' }],
    
    // ENGINEERING
    ['circuit', { system: 'Engineering', organ: 'Electrical', tissue: 'Circuit Design' }],
    ['stress', { system: 'Engineering', organ: 'Mechanical', tissue: 'Material Properties' }],
    ['beam', { system: 'Engineering', organ: 'Structural', tissue: 'Load-bearing Elements' }],
    ['flow', { system: 'Engineering', organ: 'Fluid Dynamics', tissue: 'Fluid Motion' }],
    
    // BUSINESS
    ['strategy', { system: 'Business', organ: 'Management', tissue: 'Strategic Planning' }],
    ['revenue', { system: 'Business', organ: 'Finance', tissue: 'Financial Performance' }],
    ['marketing', { system: 'Business', organ: 'Marketing', tissue: 'Customer Engagement' }],
    ['operations', { system: 'Business', organ: 'Operations', tissue: 'Process Management' }],
    
    // PSYCHOLOGY
    ['cognition', { system: 'Psychology', organ: 'Cognitive Science', tissue: 'Mental Processes' }],
    ['behavior', { system: 'Psychology', organ: 'Behavioral Science', tissue: 'Human Behavior' }],
    ['memory', { system: 'Psychology', organ: 'Cognitive Psychology', tissue: 'Memory Systems' }],
    ['learning', { system: 'Psychology', organ: 'Educational Psychology', tissue: 'Learning Processes' }],
    
    // General Academic Terms
    ['concept', { system: 'General', tissue: 'Core Concept' }],
    ['theory', { system: 'General', tissue: 'Theoretical Framework' }],
    ['principle', { system: 'General', tissue: 'Fundamental Principle' }],
    ['method', { system: 'General', tissue: 'Methodology' }],
    ['analysis', { system: 'General', tissue: 'Analytical Process' }],
    ['synthesis', { system: 'General', tissue: 'Integration Process' }],
    ['evaluation', { system: 'General', tissue: 'Assessment Process' }]
  ]);

  // Clinical Timeline Rules
  private timelineRules = [
    { pattern: /assess|evaluate|examine|diagnose|history|symptoms/, timeline: 'PreOp' as Timeline },
    { pattern: /procedure|surgery|treatment|intervention|operation|during/, timeline: 'IntraOp' as Timeline },
    { pattern: /recovery|follow.?up|monitor|outcome|prognosis|after/, timeline: 'PostOp' as Timeline },
    { pattern: /prevent|prepare|plan|before|prior/, timeline: 'PreOp' as Timeline },
    { pattern: /complications|manage|ongoing|surveillance/, timeline: 'PostOp' as Timeline }
  ];

  // Decision Node Rules
  private decisionRules = [
    { pattern: /stable|stabilize|support|maintain|emergency/, node: 'stabilize' as DecisionNode },
    { pattern: /diagnose|identify|determine|assess|evaluate|test/, node: 'diagnose' as DecisionNode },
    { pattern: /treat|therapy|manage|intervention|medication|surgery/, node: 'treat' as DecisionNode },
    { pattern: /monitor|follow|track|observe|surveillance|watch/, node: 'monitor' as DecisionNode }
  ];

  // Surgeon Action Rules
  private surgeonRules: SurgeonRule[] = [
    {
      if: { pdrm: 'R', 'surgeon.axis.organ': 'PNS', cue_words: ['neural crest'] },
      then_actions: ['compare', 'quiz', 'mnemonic'],
      confidence: 0.85
    },
    {
      if: { pdrm: 'R', 'surgeon.axis.molecule': 'Chromatin' },
      then_actions: ['explain', 'mnemonic'],
      confidence: 0.8
    },
    {
      if: { pdrm: 'R', 'surgeon.axis.organ': 'Heart' },
      then_actions: ['timeline', 'compare'],
      confidence: 0.9
    },
    {
      if: { pdrm: 'M', evidence_score: 0.7 },
      then_actions: ['explain', 'quiz'],
      confidence: 0.75
    },
    {
      if: { pdrm: 'P' },
      then_actions: ['diagram', 'explain'],
      confidence: 0.7
    },
    {
      if: { pdrm: 'D' },
      then_actions: ['compare', 'quiz'],
      confidence: 0.8
    }
  ];

  /**
   * Main fused pipeline function - combines PDRM 2.0 + Surgeon-View overlays
   */
  async runFusedPipeline(
    text: string,
    thoughtUnits: ThoughtUnit[],
    context: {
      userId: string;
      bookId: string;
      page: number;
    }
  ): Promise<FusedAnalysisResult> {
    console.log('🔬 Running Surgeon-View PDRM Butler 2.1 Fused Pipeline...');

    // Step 1: Convert ThoughtUnits to SurgeonUnits with overlays
    const surgeonUnits = await this.convertToSurgeonUnits(thoughtUnits, context);

    // Step 2: Apply PDRM 2.0 classification
    const unitsWithPDRM = await this.applyPDRMClassification(surgeonUnits, text);

    // Step 3: Apply Surgeon-View overlays (anatomical, timeline, decision nodes)
    const unitsWithSurgeonOverlay = await this.applySurgeonOverlays(unitsWithPDRM);

    // Step 4: Generate Butler actions based on rules
    const butlerActions = await this.generateButlerActions(unitsWithSurgeonOverlay);

    // Step 5: Calculate overall confidence
    const confidence = this.calculateOverallConfidence(unitsWithSurgeonOverlay, butlerActions);

    console.log(`✅ Fused pipeline complete: ${unitsWithSurgeonOverlay.length} units, ${butlerActions.length} actions`);

    return {
      units: unitsWithSurgeonOverlay,
      actions: butlerActions,
      rules: this.surgeonRules,
      confidence
    };
  }

  /**
   * Convert ThoughtUnits to SurgeonUnits with basic structure
   */
  private async convertToSurgeonUnits(
    thoughtUnits: ThoughtUnit[],
    context: { userId: string; bookId: string; page: number }
  ): Promise<SurgeonUnit[]> {
    return thoughtUnits.map((unit, index) => ({
      unit_id: `surgeon-${context.page}-${index}`,
      text: unit.text,
      anchors: { page: context.page, para: index },
      surgeon: {
        axis: {},
        timeline: 'PreOp', // Default timeline
        decision_node: 'diagnose' // Default decision node
      },
      cue_words: [],
      evidence_score: unit.confidence,
      needs_action: [],
      prereqs: [],
      dependencies: []
    }));
  }

  /**
   * Apply PDRM 2.0 classification to surgeon units
   */
  private async applyPDRMClassification(
    units: SurgeonUnit[],
    fullText: string
  ): Promise<SurgeonUnit[]> {
    // Simple PDRM classification based on text analysis
    return units.map(unit => {
      const lowerText = unit.text.toLowerCase();
      let pdrm: PDRM | undefined;

      // Problem indicators
      if (lowerText.includes('problem') || lowerText.includes('issue') || 
          lowerText.includes('challenge') || lowerText.includes('difficulty')) {
        pdrm = 'P';
      }
      // Differential indicators  
      else if (lowerText.includes('compare') || lowerText.includes('versus') || 
               lowerText.includes('different') || lowerText.includes('alternative')) {
        pdrm = 'D';
      }
      // Management indicators
      else if (lowerText.includes('treatment') || lowerText.includes('manage') || 
               lowerText.includes('therapy') || lowerText.includes('intervention')) {
        pdrm = 'M';
      }
      // Reasoning (default for explanatory content)
      else {
        pdrm = 'R';
      }

      return { ...unit, pdrm };
    });
  }

  /**
   * Apply Surgeon-View overlays: anatomical axes, timelines, decision nodes
   */
  private async applySurgeonOverlays(units: SurgeonUnit[]): Promise<SurgeonUnit[]> {
    return units.map(unit => {
      const lowerText = unit.text.toLowerCase();
      
      // Extract anatomical axis
      const axis = this.extractAnatomicalAxis(lowerText);
      
      // Extract clinical timeline
      const timeline = this.extractTimeline(lowerText);
      
      // Extract decision node
      const decisionNode = this.extractDecisionNode(lowerText);
      
      // Extract cue words
      const cueWords = this.extractCueWords(unit.text);

      return {
        ...unit,
        surgeon: {
          axis,
          timeline,
          decision_node: decisionNode
        },
        cue_words: cueWords
      };
    });
  }

  /**
   * Extract anatomical axis from text
   */
  private extractAnatomicalAxis(text: string): Axis {
    let bestMatch: Axis = {};
    let maxMatches = 0;

    // Check each knowledge rule
    this.knowledgeRules.forEach((axis, term) => {
      if (text.includes(term.toLowerCase())) {
        const matchCount = Object.keys(axis).length;
        if (matchCount > maxMatches) {
          bestMatch = axis;
          maxMatches = matchCount;
        }
      }
    });

    return bestMatch;
  }

  /**
   * Extract clinical timeline from text
   */
  private extractTimeline(text: string): Timeline {
    for (const rule of this.timelineRules) {
      if (rule.pattern.test(text)) {
        return rule.timeline;
      }
    }
    return 'PreOp'; // Default
  }

  /**
   * Extract decision node from text
   */
  private extractDecisionNode(text: string): DecisionNode {
    for (const rule of this.decisionRules) {
      if (rule.pattern.test(text)) {
        return rule.node;
      }
    }
    return 'diagnose'; // Default
  }

  /**
   * Extract cue words from text
   */
  private extractCueWords(text: string): string[] {
    const cueWords: string[] = [];
    const words = text.toLowerCase().split(/\s+/);
    
    // Check knowledge terms
    this.knowledgeRules.forEach((axis, term) => {
      if (text.toLowerCase().includes(term)) {
        cueWords.push(term);
      }
    });

    // Add medical/scientific terms
    const medicalTerms = ['protein', 'enzyme', 'hormone', 'receptor', 'pathway', 'mechanism', 
                         'syndrome', 'disease', 'therapy', 'diagnosis', 'prognosis'];
    
    medicalTerms.forEach(term => {
      if (text.toLowerCase().includes(term)) {
        cueWords.push(term);
      }
    });

    return [...new Set(cueWords)].slice(0, 5); // Unique terms, max 5
  }

  /**
   * Generate Butler actions based on surgeon rules
   */
  private async generateButlerActions(units: SurgeonUnit[]): Promise<ButlerAction[]> {
    const actions: ButlerAction[] = [];

    for (const unit of units) {
      const matchingRules = this.findMatchingRules(unit);
      
      for (const rule of matchingRules) {
        for (const actionType of rule.then_actions) {
          const action = await this.createButlerAction(actionType, unit, rule.confidence);
          actions.push(action);
          
          // Add to unit's needs_action
          if (!unit.needs_action.includes(actionType)) {
            unit.needs_action.push(actionType);
          }
        }
      }
    }

    return actions;
  }

  /**
   * Find matching rules for a surgeon unit
   */
  private findMatchingRules(unit: SurgeonUnit): SurgeonRule[] {
    return this.surgeonRules.filter(rule => {
      // Check PDRM match
      if (rule.if.pdrm && rule.if.pdrm !== unit.pdrm) return false;
      
      // Check anatomical axis matches
      if (rule.if['surgeon.axis.system'] && 
          unit.surgeon.axis.system !== rule.if['surgeon.axis.system']) return false;
      if (rule.if['surgeon.axis.organ'] && 
          unit.surgeon.axis.organ !== rule.if['surgeon.axis.organ']) return false;
      if (rule.if['surgeon.axis.tissue'] && 
          unit.surgeon.axis.tissue !== rule.if['surgeon.axis.tissue']) return false;
      
      // Check cue words
      if (rule.if.cue_words) {
        const hasCueWord = rule.if.cue_words.some(cue => 
          unit.cue_words.includes(cue) || unit.text.toLowerCase().includes(cue.toLowerCase())
        );
        if (!hasCueWord) return false;
      }

      // Check evidence score
      if (rule.if.evidence_score && unit.evidence_score < rule.if.evidence_score) {
        return false;
      }

      return true; // All conditions met
    });
  }

  /**
   * Create a Butler action for a specific surgeon unit
   */
  private async createButlerAction(
    actionType: SurgeonAction,
    unit: SurgeonUnit,
    ruleConfidence: number
  ): Promise<ButlerAction> {
    const payload = await this.generateActionPayload(actionType, unit);
    const reasoning = this.generateActionReasoning(actionType, unit);

    return {
      type: actionType,
      payload,
      anchors: unit.anchors,
      confidence: Math.min(ruleConfidence, unit.evidence_score),
      reasoning
    };
  }

  /**
   * Generate payload for different action types
   */
  private async generateActionPayload(actionType: SurgeonAction, unit: SurgeonUnit): Promise<any> {
    const basePayload = {
      unitId: unit.unit_id,
      text: unit.text,
      axis: unit.surgeon.axis,
      timeline: unit.surgeon.timeline,
      decisionNode: unit.surgeon.decision_node,
      cueWords: unit.cue_words
    };

    switch (actionType) {
      case 'explain':
        return {
          ...basePayload,
          prompt: this.generateExplainPrompt(unit),
          expectedLength: '120-180 words'
        };

      case 'compare':
        return {
          ...basePayload,
          prompt: this.generateComparePrompt(unit),
          format: 'table',
          columns: ['Aspect', 'Option A', 'Option B', 'Key Difference']
        };

      case 'quiz':
        return {
          ...basePayload,
          prompt: this.generateQuizPrompt(unit),
          questionCount: 2,
          format: 'multiple-choice'
        };

      case 'mnemonic':
        return {
          ...basePayload,
          prompt: this.generateMnemonicPrompt(unit),
          maxLength: 20
        };

      case 'timeline':
        return {
          ...basePayload,
          prompt: this.generateTimelinePrompt(unit),
          phases: ['PreOp', 'IntraOp', 'PostOp'],
          checkpoints: 3-5
        };

      case 'diagram':
        return {
          ...basePayload,
          prompt: this.generateDiagramPrompt(unit),
          format: 'bullet-scaffold'
        };

      default:
        return basePayload;
    }
  }

  /**
   * Generate action reasoning
   */
  private generateActionReasoning(actionType: SurgeonAction, unit: SurgeonUnit): string {
    const axisStr = Object.entries(unit.surgeon.axis)
      .filter(([_, value]) => value)
      .map(([key, value]) => `${key}:${value}`)
      .join(', ');

    return `${actionType} suggested for ${unit.pdrm} content with ${axisStr} in ${unit.surgeon.timeline} phase (${unit.surgeon.decision_node} node)`;
  }

  /**
   * Generate surgeon-specific prompts for each action type
   */
  private generateExplainPrompt(unit: SurgeonUnit): string {
    const axisPath = [
      unit.surgeon.axis.system,
      unit.surgeon.axis.organ,
      unit.surgeon.axis.tissue,
      unit.surgeon.axis.cell,
      unit.surgeon.axis.molecule
    ].filter(Boolean).join(' → ');

    return `Explain this unit using surgeon-view thinking: ${axisPath}. Start with stabilization checks, then diagnostic reasoning, then management options. Keep to 120-180 words with reference to page ${unit.anchors.page}.`;
  }

  private generateComparePrompt(unit: SurgeonUnit): string {
    const primaryConcept = unit.cue_words[0] || 'concept';
    return `Create a surgical comparison table contrasting different aspects of ${primaryConcept}. Include embryologic origin, derivatives, and common lesions. Add 1-line footnote with page anchor.`;
  }

  private generateQuizPrompt(unit: SurgeonUnit): string {
    return `Generate 2 DAT-style MCQs from this surgical content. Include 1 best answer, 3 distractors, and 1-line rationale. List correct letters at end.`;
  }

  private generateMnemonicPrompt(unit: SurgeonUnit): string {
    const cueWords = unit.cue_words.slice(0, 3).join(', ');
    return `Generate a short, pronounceable mnemonic for: ${cueWords}. Make it memorable and tied to the anatomical axis.`;
  }

  private generateTimelinePrompt(unit: SurgeonUnit): string {
    return `Create a surgical timeline for this content with PreOp/IntraOp/PostOp phases. Include 3-5 checkpoints with clear decision points.`;
  }

  private generateDiagramPrompt(unit: SurgeonUnit): string {
    return `Output a bullet scaffold for a diagram showing the anatomical relationships and surgical approach. Include nodes/arrows structure for quick drawing.`;
  }

  /**
   * Calculate overall confidence for the fused analysis
   */
  private calculateOverallConfidence(units: SurgeonUnit[], actions: ButlerAction[]): number {
    if (units.length === 0) return 0;

    const avgUnitConfidence = units.reduce((sum, unit) => sum + unit.evidence_score, 0) / units.length;
    const avgActionConfidence = actions.length > 0 
      ? actions.reduce((sum, action) => sum + action.confidence, 0) / actions.length 
      : 0;

    const unitCoverage = units.filter(u => u.needs_action.length > 0).length / units.length;
    
    return (avgUnitConfidence * 0.4 + avgActionConfidence * 0.4 + unitCoverage * 0.2);
  }

  /**
   * Export surgeon units to NoteLab format
   */
  exportUnitsToNoteLab(units: SurgeonUnit[]): NoteLabExport[] {
    return units.map(unit => ({
      id: `notelab-${unit.unit_id}`,
      type: 'thought-unit' as const,
      title: `Surgeon Unit: ${unit.surgeon.axis.system || 'General'} - ${unit.surgeon.axis.organ || 'Analysis'}`,
      content: unit.text,
      tags: [
        unit.pdrm || 'unclassified',
        unit.surgeon.timeline,
        unit.surgeon.decision_node,
        ...unit.cue_words,
        ...(unit.surgeon.axis.system ? [unit.surgeon.axis.system] : []),
        ...(unit.surgeon.axis.organ ? [unit.surgeon.axis.organ] : [])
      ],
      anchors: unit.anchors,
      created_at: new Date().toISOString(),
      pdrm_data: {
        category: unit.pdrm || 'R',
        axis: unit.surgeon.axis,
        timeline: unit.surgeon.timeline,
        decision_node: unit.surgeon.decision_node
      }
    }));
  }

  /**
   * Export butler actions to NoteLab format
   */
  exportActionsToNoteLab(actions: ButlerAction[]): NoteLabExport[] {
    return actions.map(action => ({
      id: `notelab-action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'butler-action' as const,
      title: `Butler ${action.type.charAt(0).toUpperCase() + action.type.slice(1)}: ${action.reasoning.slice(0, 50)}...`,
      content: JSON.stringify(action.payload, null, 2),
      tags: [
        action.type,
        `confidence-${Math.round(action.confidence * 100)}`,
        'butler-generated'
      ],
      anchors: action.anchors,
      created_at: new Date().toISOString()
    }));
  }

  /**
   * Export to Memo.cards format
   */
  exportToMemoCards(units: SurgeonUnit[], actions: ButlerAction[]): MemoCardExport[] {
    const cards: MemoCardExport[] = [];

    // Export units as cards
    units.forEach(unit => {
      cards.push({
        title: `${unit.surgeon.axis.system || 'General'} - ${unit.surgeon.axis.organ || 'Concept'}`,
        body: unit.text,
        tags: [
          unit.pdrm || 'unclassified',
          unit.surgeon.timeline,
          unit.surgeon.decision_node,
          ...unit.cue_words
        ],
        anchors: unit.anchors,
        created_at: new Date().toISOString(),
        metadata: {
          source: 'surgeon-view-pdrm',
          type: 'thought-unit',
          confidence: unit.evidence_score
        }
      });
    });

    // Export high-confidence actions as cards
    actions.filter(action => action.confidence >= 0.7).forEach(action => {
      cards.push({
        title: `${action.type.toUpperCase()}: ${action.reasoning.split('(')[0].trim()}`,
        body: typeof action.payload === 'string' ? action.payload : JSON.stringify(action.payload.prompt || action.payload),
        tags: [
          action.type,
          'butler-action',
          `confidence-${Math.round(action.confidence * 100)}`
        ],
        anchors: action.anchors,
        created_at: new Date().toISOString(),
        metadata: {
          source: 'surgeon-view-pdrm',
          type: 'butler-action',
          confidence: action.confidence
        }
      });
    });

    return cards;
  }
}

// Export singleton instance
export const surgeonPdrmEngine = new SurgeonPdrmEngine();
export default surgeonPdrmEngine;
