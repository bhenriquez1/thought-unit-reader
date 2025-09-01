// Thought-Unit Core Helpers
// Extracted from CleanHybridReader for shared use across DAT Apex

import { 
  createThoughtUnits, 
  extractMainIdea, 
  analyzeTextForThoughtUnitsEnhanced,
  type ThoughtUnit, 
  type ThoughtUnitBoundary 
} from "@/lib/thoughtUnitExtraction";

import { 
  enhancedHybridAnalysisEngine,
  type ComprehensiveAnalysisResult 
} from "@/lib/enhancedHybridAnalysis";

// Core TU analysis functions
export interface TUAnalysisResult {
  mainIdea: string;
  confidence: number;
  thoughtUnits: ThoughtUnit[];
  supportingPoints: string[];
  keyTerms: string[];
  visualMetaphors: string[];
  comprehensiveAnalysis?: ComprehensiveAnalysisResult;
}

export interface TUExplanationData {
  originalText: string;
  mainIdea: string;
  supportingDetails: string[];
  keyTerms: string[];
  visualMetaphors: string[];
  butlerMetaphors: ButlerMetaphor[];
  conceptHighlights: ConceptHighlight[];
  understandingLevel: "surface" | "deep" | "mastery";
}

// David Butler-inspired concept highlighting for medical/educational content
export interface ConceptHighlight {
  id: string;
  text: string;
  type: "main-idea" | "supporting-concept" | "example" | "definition" | "relationship" | "process" | "mechanism";
  color: string;
  importance: number; // 0-1 scale
  connections: string[]; // IDs of related concepts
  visualMetaphor?: string; // Butler-style metaphor
  spatialPosition?: { x: number; y: number }; // For spatial understanding
}

// Butler-style visual metaphor suggestions
export interface ButlerMetaphor {
  concept: string;
  metaphor: string;
  explanation: string;
  visualCue: string;
}

// Generate Butler-style metaphors for DAT content
export function generateButlerMetaphors(text: string): ButlerMetaphor[] {
  const metaphors: ButlerMetaphor[] = [];
  
  // Enhanced DAT-focused medical/dental metaphors (Butler's specialty)
  const dentalMedicalPatterns = [
    // Dental-specific for DAT
    { pattern: /tooth|teeth|dental|enamel|dentin|pulp/gi, metaphor: "fortress with layers", explanation: "Think of a tooth like a medieval fortress - enamel is the outer wall, dentin is the inner structure, and pulp is the protected core with all the vital supplies", visualCue: "🏰" },
    { pattern: /cavity|caries|decay/gi, metaphor: "enemy siege", explanation: "Tooth decay is like an enemy army slowly breaking down the fortress walls - bacteria are the invaders weakening your defenses", visualCue: "⚔️" },
    { pattern: /gum|gingiva|periodontal/gi, metaphor: "foundation and moat", explanation: "Gums are like the foundation and protective moat around your tooth fortress - they need to stay strong to protect the whole structure", visualCue: "🌊" },
    { pattern: /root|root canal/gi, metaphor: "underground supply lines", explanation: "Tooth roots are like underground supply lines bringing nutrients and removing waste - when they're damaged, the whole system suffers", visualCue: "🚇" },
    { pattern: /bite|occlusion|jaw/gi, metaphor: "precision machinery", explanation: "Your bite is like precision machinery where every gear (tooth) must align perfectly for smooth operation", visualCue: "⚙️" },
    
    // Medical/anatomical for DAT
    { pattern: /pain|hurt|ache|discomfort/gi, metaphor: "alarm system", explanation: "Think of pain as your body's sophisticated alarm system - it's trying to tell you something important about what needs attention", visualCue: "🚨" },
    { pattern: /nerve|neural|neuron/gi, metaphor: "electrical highway", explanation: "Nerves are like a complex electrical highway system carrying messages at lightning speed throughout your body", visualCue: "⚡" },
    { pattern: /brain|cerebral|cortex/gi, metaphor: "mission control center", explanation: "The brain is like NASA's mission control - monitoring everything, making split-second decisions, and coordinating complex operations", visualCue: "🧠" },
    { pattern: /muscle|tissue|fiber/gi, metaphor: "elastic rope system", explanation: "Muscles work like an intelligent elastic rope system - they can stretch, contract, and adjust tension based on what you need", visualCue: "🎯" },
    { pattern: /bone|skeleton|calcium/gi, metaphor: "living scaffolding", explanation: "Bones are like living scaffolding that's constantly rebuilding itself - strong yet adaptable, supporting everything above", visualCue: "🏗️" },
    { pattern: /blood|circulation|heart/gi, metaphor: "delivery network", explanation: "Your circulatory system is like the world's most efficient delivery network - bringing supplies and removing waste 24/7", visualCue: "🚚" },
    { pattern: /healing|recovery|repair/gi, metaphor: "master craftsmen", explanation: "Your body's healing process is like master craftsmen who know exactly how to rebuild and restore damaged areas", visualCue: "🔧" },
    { pattern: /inflammation|swelling/gi, metaphor: "emergency response team", explanation: "Inflammation is like an emergency response team rushing to help - sometimes they're heroes, sometimes they overreact", visualCue: "🚑" },
    
    // Physiological processes for DAT
    { pattern: /enzyme|catalyst|reaction/gi, metaphor: "molecular matchmakers", explanation: "Enzymes are like molecular matchmakers - they bring the right chemicals together at exactly the right time to make reactions happen", visualCue: "💕" },
    { pattern: /hormone|endocrine|signal/gi, metaphor: "chemical messengers", explanation: "Hormones are like chemical messengers carrying important news throughout your body's communication network", visualCue: "📨" },
    { pattern: /membrane|barrier|transport/gi, metaphor: "smart security gate", explanation: "Cell membranes are like smart security gates - they know exactly what to let in, what to keep out, and when to open", visualCue: "🚪" },
    { pattern: /metabolism|energy|ATP/gi, metaphor: "cellular power plant", explanation: "Metabolism is like having millions of tiny power plants in your cells, converting fuel into usable energy", visualCue: "⚡" },
    
    // Organic chemistry for DAT
    { pattern: /molecule|compound|structure/gi, metaphor: "molecular architecture", explanation: "Molecules are like tiny architectural structures - the shape determines the function, just like buildings", visualCue: "🏛️" },
    { pattern: /bond|electron|orbital/gi, metaphor: "atomic handshakes", explanation: "Chemical bonds are like atomic handshakes - atoms sharing or trading electrons to stay stable and happy", visualCue: "🤝" },
    { pattern: /reaction|synthesis|breakdown/gi, metaphor: "molecular dance", explanation: "Chemical reactions are like choreographed molecular dances - partners change, but the dance follows predictable patterns", visualCue: "💃" }
  ];
  
  // Educational metaphors for complex concepts
  const educationalPatterns = [
    { pattern: /system|process|mechanism/gi, metaphor: "orchestrated symphony", explanation: "Complex biological systems work like a symphony orchestra - each part plays its role in perfect harmony to create something beautiful", visualCue: "🎼" },
    { pattern: /connection|relationship|link/gi, metaphor: "living web", explanation: "Biological connections form a living web where everything influences everything else - pull one strand and the whole web responds", visualCue: "🕸️" },
    { pattern: /function|purpose|role/gi, metaphor: "specialized job", explanation: "Every biological structure has a specialized job - like workers in a city, each one essential for the whole community to thrive", visualCue: "👷" },
    { pattern: /adaptation|change|evolution/gi, metaphor: "intelligent problem-solving", explanation: "Biological adaptation is like intelligent problem-solving - finding creative solutions to environmental challenges over time", visualCue: "🧩" },
    { pattern: /balance|homeostasis|equilibrium/gi, metaphor: "master juggler", explanation: "Your body maintaining balance is like a master juggler keeping multiple balls in the air - constant tiny adjustments to maintain stability", visualCue: "🤹" }
  ];
  
  [...dentalMedicalPatterns, ...educationalPatterns].forEach(({ pattern, metaphor, explanation, visualCue }) => {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      metaphors.push({
        concept: matches[0],
        metaphor,
        explanation,
        visualCue
      });
    }
  });
  
  return metaphors.slice(0, 6); // Enhanced DAT-focused metaphors for better understanding
}

// Enhanced right-brain concept extraction with intelligent chunking
export function extractConcepts(text: string): ConceptHighlight[] {
  const concepts: ConceptHighlight[] = [];
  
  // Enhanced main ideas patterns (highest importance)
  const mainIdeaPatterns = [
    /\b(the main|primary|key|central|core|fundamental|essential|most important)\s+(\w+(?:\s+\w+){0,4})/gi,
    /\b(principle|concept|theory|law|rule|mechanism|process)\s+(?:of|that|which)\s+(\w+(?:\s+\w+){0,3})/gi,
    /\b(understanding|comprehension|knowledge)\s+(?:of|about)\s+(\w+(?:\s+\w+){0,3})/gi,
    // Sentence-level main ideas
    /^([^.!?]*(?:important|significant|crucial|vital|essential|key)[^.!?]*[.!?])/gmi,
    /^([^.!?]*(?:remember|note that|keep in mind)[^.!?]*[.!?])/gmi
  ];
  
  mainIdeaPatterns.forEach((pattern, patternIndex) => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach((match, index) => {
      const conceptText = match[0].trim();
      if (conceptText.length > 10) { // Filter out very short matches
        concepts.push({
          id: `main-${patternIndex}-${index}`,
          text: conceptText,
          type: "main-idea",
          color: "#FFD700", // Gold for main ideas
          importance: 0.9,
          connections: []
        });
      }
    });
  });

  // Enhanced supporting concepts with chunking
  const supportingPatterns = [
    /\b(because|since|due to|as a result|therefore|thus|hence|consequently)\s+([^.!?]+[.!?])/gi,
    /\b(for example|such as|including|like|specifically|namely)\s+([^.!?]+[.!?])/gi,
    /\b(this means|in other words|that is|i\.e\.|e\.g\.)\s+([^.!?]+[.!?])/gi,
    // Cause and effect chunking
    /([^.!?]*(?:causes?|leads? to|results? in|triggers?|produces?)[^.!?]*[.!?])/gi,
    // Process steps chunking
    /([^.!?]*(?:first|second|third|next|then|finally|lastly)[^.!?]*[.!?])/gi
  ];
  
  supportingPatterns.forEach((pattern, patternIndex) => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach((match, index) => {
      const conceptText = match[0].trim();
      if (conceptText.length > 15) {
        concepts.push({
          id: `support-${patternIndex}-${index}`,
          text: conceptText,
          type: "supporting-concept",
          color: "#87CEEB", // Sky blue for supporting
          importance: 0.6,
          connections: []
        });
      }
    });
  });

  // Enhanced definitions with better chunking
  const definitionPatterns = [
    /\b(\w+(?:\s+\w+){0,2})\s+(is|are|means|refers to|defined as|represents)\s+([^.!?]+[.!?])/gi,
    // Full sentence definitions
    /([^.!?]*(?:definition|define|term|concept)\s+(?:of|for)\s+\w+[^.!?]*[.!?])/gi,
    // Medical/scientific definitions
    /([^.!?]*(?:condition|disease|syndrome|disorder|symptom)\s+(?:is|are|means)[^.!?]*[.!?])/gi
  ];
  
  definitionPatterns.forEach((pattern, patternIndex) => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach((match, index) => {
      const conceptText = match[0].trim();
      if (conceptText.length > 10) {
        concepts.push({
          id: `def-${patternIndex}-${index}`,
          text: conceptText,
          type: "definition",
          color: "#98FB98", // Light green for definitions
          importance: 0.7,
          connections: []
        });
      }
    });
  });

  // New: Process and mechanism chunking (great for DAT content)
  const processPatterns = [
    /([^.!?]*(?:process|mechanism|pathway|system|method|procedure)[^.!?]*[.!?])/gi,
    /([^.!?]*(?:occurs?|happens?|takes? place|develops?)[^.!?]*[.!?])/gi,
    /([^.!?]*(?:function|role|purpose|job)[^.!?]*[.!?])/gi
  ];
  
  processPatterns.forEach((pattern, patternIndex) => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach((match, index) => {
      const conceptText = match[0].trim();
      if (conceptText.length > 20) {
        concepts.push({
          id: `process-${patternIndex}-${index}`,
          text: conceptText,
          type: "process",
          color: "#DDA0DD", // Plum for processes
          importance: 0.8,
          connections: []
        });
      }
    });
  });

  // New: Relationship chunking
  const relationshipPatterns = [
    /([^.!?]*(?:relationship|connection|link|association|correlation)[^.!?]*[.!?])/gi,
    /([^.!?]*(?:affects?|influences?|impacts?|interacts? with)[^.!?]*[.!?])/gi,
    /([^.!?]*(?:similar to|different from|compared to|unlike)[^.!?]*[.!?])/gi
  ];
  
  relationshipPatterns.forEach((pattern, patternIndex) => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach((match, index) => {
      const conceptText = match[0].trim();
      if (conceptText.length > 15) {
        concepts.push({
          id: `rel-${patternIndex}-${index}`,
          text: conceptText,
          type: "relationship",
          color: "#F0E68C", // Khaki for relationships
          importance: 0.65,
          connections: []
        });
      }
    });
  });

  // Sort by importance and limit to prevent overwhelming
  return concepts
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 15); // Increased limit for better coverage
}

// Enhanced smart content generator with right-brain understanding
export function generateSmartContent(selectedText: string, pageContext: string): {
  definitions: string[];
  summary: string;
  questions: string[];
  relatedConcepts: string[];
  mainIdeas: string[];
  visualMetaphors: string[];
  understandingLevel: "surface" | "deep" | "mastery";
} {
  const words = selectedText.toLowerCase().split(/\s+/);
  
  // Enhanced keyword extraction for definitions
  const technicalTerms = words.filter(word => 
    word.length > 6 && 
    /^[a-z]+$/.test(word) &&
    !['however', 'therefore', 'because', 'through', 'without', 'between', 'important', 'significant'].includes(word)
  );

  // Extract main ideas using right-brain patterns
  const ideaPatterns = [
    /\b(the key|main|primary|central|core|fundamental|essential)\s+(\w+(?:\s+\w+){0,3})\b/gi,
    /\b(concept|principle|theory|law|rule|method|approach|strategy)\s+of\s+(\w+(?:\s+\w+){0,2})/gi,
    /\b(\w+(?:\s+\w+){0,2})\s+(is|are|means|refers to|represents|symbolizes)/gi
  ];
  
  const mainIdeas: string[] = [];
  ideaPatterns.forEach(pattern => {
    const matches = selectedText.match(pattern);
    if (matches) {
      mainIdeas.push(...matches.slice(0, 2));
    }
  });

  // Generate visual metaphors for understanding
  const visualMetaphors = [
    `Think of this like a ${getRandomMetaphor()} where...`,
    `Imagine this concept as a ${getRandomMetaphor()} that...`,
    `This works similar to how a ${getRandomMetaphor()} functions...`
  ];

  // Enhanced summary with understanding focus
  const sentences = selectedText.split(/[.!?]+/);
  const summary = sentences.length > 1 
    ? `Key insight: ${sentences[0]?.trim()}. This means: ${sentences[1]?.trim().slice(0, 50)}...`
    : sentences[0]?.trim() + "...";

  // Right-brain focused comprehension questions
  const questions = [
    `What's the BIG PICTURE idea here?`,
    `How does this connect to what you already know?`,
    `If you had to explain this to a friend, what would you say?`,
    `What would happen if this concept didn't exist?`
  ];

  // Determine understanding level
  const understandingLevel = selectedText.length > 200 ? "deep" : 
                           selectedText.length > 50 ? "surface" : "mastery";

  return {
    definitions: technicalTerms.slice(0, 3),
    summary: summary || selectedText.slice(0, 100) + "...",
    questions: questions.slice(0, 2),
    relatedConcepts: technicalTerms.slice(0, 5),
    mainIdeas: mainIdeas.slice(0, 3),
    visualMetaphors: visualMetaphors.slice(0, 1),
    understandingLevel
  };
}

// Helper function for visual metaphors
function getRandomMetaphor(): string {
  const metaphors = [
    "tree with branches", "river flowing", "building with floors", 
    "puzzle piece", "bridge connecting", "key unlocking", "map showing paths",
    "garden growing", "machine with gears", "story unfolding"
  ];
  return metaphors[Math.floor(Math.random() * metaphors.length)];
}

// Main TU analysis function
export async function analyzeTU(text: string, enhanced: boolean = true): Promise<TUAnalysisResult> {
  try {
    // Extract main idea
    const mainIdeaResult = extractMainIdea(text);
    
    // Get thought units
    const thoughtUnits = enhanced 
      ? (await analyzeTextForThoughtUnitsEnhanced(text)).thoughtUnits
      : createThoughtUnits(text);
    
    // Generate supporting content
    const smartContent = generateSmartContent(text, "");
    const butlerMetaphors = generateButlerMetaphors(text);
    const concepts = extractConcepts(text);
    
    // Enhanced analysis if requested
    let comprehensiveAnalysis: ComprehensiveAnalysisResult | undefined;
    if (enhanced) {
      try {
        comprehensiveAnalysis = await enhancedHybridAnalysisEngine.analyzeText(text);
      } catch (error) {
        console.warn('Enhanced analysis failed, using basic analysis:', error);
      }
    }
    
    return {
      mainIdea: mainIdeaResult.primaryIdea || "",
      confidence: mainIdeaResult.confidence || 0,
      thoughtUnits,
      supportingPoints: smartContent.mainIdeas,
      keyTerms: smartContent.definitions,
      visualMetaphors: butlerMetaphors.map(m => m.explanation),
      comprehensiveAnalysis
    };
  } catch (error) {
    console.error('TU analysis failed:', error);
    
    // Fallback to basic analysis
    return {
      mainIdea: text.slice(0, 100) + "...",
      confidence: 0.5,
      thoughtUnits: [],
      supportingPoints: [],
      keyTerms: [],
      visualMetaphors: [],
    };
  }
}

// Generate TU explanation data for DAT questions
export async function generateTUExplanation(
  questionText: string, 
  explanation: string, 
  enhanced: boolean = true
): Promise<TUExplanationData> {
  const fullText = `${questionText}\n\n${explanation}`;
  const analysis = await analyzeTU(fullText, enhanced);
  
  return {
    originalText: fullText,
    mainIdea: analysis.mainIdea,
    supportingDetails: analysis.supportingPoints,
    keyTerms: analysis.keyTerms,
    visualMetaphors: analysis.visualMetaphors,
    butlerMetaphors: generateButlerMetaphors(fullText),
    conceptHighlights: extractConcepts(fullText),
    understandingLevel: fullText.length > 200 ? "deep" : 
                       fullText.length > 50 ? "surface" : "mastery"
  };
}
