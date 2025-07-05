// lib/parser.ts - Universal Academic Text Parser
interface AcademicTerm {
  term: string;
  category: 'science' | 'math' | 'literature' | 'history' | 'philosophy' | 'psychology' | 'economics' | 'art' | 'language' | 'general';
  subcategory?: string;
  color: string;
  description?: string;
  subjects?: string[];
}

const academicTerms: AcademicTerm[] = [
  // Science Terms (Blue - #3B82F6)
  { term: "hypothesis", category: "science", color: "#3B82F6", description: "Testable prediction or explanation", subjects: ["Biology", "Chemistry", "Physics"] },
  { term: "experiment", category: "science", color: "#3B82F6", description: "Controlled test of a hypothesis" },
  { term: "variable", category: "science", color: "#3B82F6", description: "Factor that can change in an experiment" },
  { term: "control group", category: "science", color: "#3B82F6", description: "Standard for comparison in experiments" },
  { term: "data analysis", category: "science", color: "#3B82F6", description: "Process of examining experimental results" },
  { term: "scientific method", category: "science", color: "#3B82F6", description: "Systematic approach to research" },
  { term: "peer review", category: "science", color: "#3B82F6", description: "Evaluation by experts in the field" },
  { term: "replication", category: "science", color: "#3B82F6", description: "Repeating experiments to verify results" },
  
  // Biology
  { term: "evolution", category: "science", subcategory: "biology", color: "#3B82F6", description: "Change in species over time" },
  { term: "natural selection", category: "science", subcategory: "biology", color: "#3B82F6", description: "Survival of the fittest mechanism" },
  { term: "DNA", category: "science", subcategory: "biology", color: "#3B82F6", description: "Genetic material" },
  { term: "ecosystem", category: "science", subcategory: "biology", color: "#3B82F6", description: "Community of organisms and environment" },
  { term: "photosynthesis", category: "science", subcategory: "biology", color: "#3B82F6", description: "Process plants use to make energy" },
  { term: "cell division", category: "science", subcategory: "biology", color: "#3B82F6", description: "Process of cells reproducing" },
  
  // Chemistry
  { term: "chemical reaction", category: "science", subcategory: "chemistry", color: "#3B82F6", description: "Process where substances change" },
  { term: "atomic structure", category: "science", subcategory: "chemistry", color: "#3B82F6", description: "Organization of atoms" },
  { term: "periodic table", category: "science", subcategory: "chemistry", color: "#3B82F6", description: "Organization of elements" },
  { term: "covalent bond", category: "science", subcategory: "chemistry", color: "#3B82F6", description: "Shared electron bond" },
  { term: "ionic bond", category: "science", subcategory: "chemistry", color: "#3B82F6", description: "Electron transfer bond" },
  { term: "pH", category: "science", subcategory: "chemistry", color: "#3B82F6", description: "Measure of acidity" },
  
  // Physics
  { term: "force", category: "science", subcategory: "physics", color: "#3B82F6", description: "Push or pull on an object" },
  { term: "acceleration", category: "science", subcategory: "physics", color: "#3B82F6", description: "Rate of change of velocity" },
  { term: "energy", category: "science", subcategory: "physics", color: "#3B82F6", description: "Ability to do work" },
  { term: "wave", category: "science", subcategory: "physics", color: "#3B82F6", description: "Disturbance that transfers energy" },
  { term: "electromagnetic radiation", category: "science", subcategory: "physics", color: "#3B82F6", description: "Energy transmitted as waves" },
  { term: "quantum mechanics", category: "science", subcategory: "physics", color: "#3B82F6", description: "Physics of very small particles" },

  // Mathematics (Purple - #8B5CF6)
  { term: "theorem", category: "math", color: "#8B5CF6", description: "Proven mathematical statement" },
  { term: "proof", category: "math", color: "#8B5CF6", description: "Logical demonstration of truth" },
  { term: "equation", category: "math", color: "#8B5CF6", description: "Mathematical statement of equality" },
  { term: "function", category: "math", color: "#8B5CF6", description: "Relationship between input and output" },
  { term: "derivative", category: "math", color: "#8B5CF6", description: "Rate of change in calculus" },
  { term: "integral", category: "math", color: "#8B5CF6", description: "Area under curve in calculus" },
  { term: "limit", category: "math", color: "#8B5CF6", description: "Value a function approaches" },
  { term: "matrix", category: "math", color: "#8B5CF6", description: "Rectangular array of numbers" },
  { term: "probability", category: "math", color: "#8B5CF6", description: "Likelihood of an event" },
  { term: "statistics", category: "math", color: "#8B5CF6", description: "Analysis of numerical data" },
  { term: "algorithm", category: "math", color: "#8B5CF6", description: "Step-by-step procedure" },
  { term: "variable", category: "math", color: "#8B5CF6", description: "Symbol representing a number" },

  // Literature (Green - #10B981)
  { term: "metaphor", category: "literature", color: "#10B981", description: "Comparison without using like or as" },
  { term: "symbolism", category: "literature", color: "#10B981", description: "Use of symbols to represent ideas" },
  { term: "irony", category: "literature", color: "#10B981", description: "Expression of meaning through opposite" },
  { term: "foreshadowing", category: "literature", color: "#10B981", description: "Hints about future events" },
  { term: "characterization", category: "literature", color: "#10B981", description: "Development of characters" },
  { term: "theme", category: "literature", color: "#10B981", description: "Central message or meaning" },
  { term: "narrative", category: "literature", color: "#10B981", description: "Story or account of events" },
  { term: "protagonist", category: "literature", color: "#10B981", description: "Main character" },
  { term: "antagonist", category: "literature", color: "#10B981", description: "Character opposing protagonist" },
  { term: "alliteration", category: "literature", color: "#10B981", description: "Repetition of initial sounds" },
  { term: "allegory", category: "literature", color: "#10B981", description: "Extended metaphor" },
  { term: "imagery", category: "literature", color: "#10B981", description: "Vivid descriptive language" },

  // History (Red - #EF4444)
  { term: "primary source", category: "history", color: "#EF4444", description: "Original historical document" },
  { term: "secondary source", category: "history", color: "#EF4444", description: "Analysis of primary sources" },
  { term: "chronology", category: "history", color: "#EF4444", description: "Order of events in time" },
  { term: "causation", category: "history", color: "#EF4444", description: "Cause and effect relationships" },
  { term: "historiography", category: "history", color: "#EF4444", description: "Study of historical writing" },
  { term: "civilization", category: "history", color: "#EF4444", description: "Advanced human society" },
  { term: "revolution", category: "history", color: "#EF4444", description: "Major political or social change" },
  { term: "empire", category: "history", color: "#EF4444", description: "Large political unit" },
  { term: "democracy", category: "history", color: "#EF4444", description: "Government by the people" },
  { term: "feudalism", category: "history", color: "#EF4444", description: "Medieval social system" },
  { term: "renaissance", category: "history", color: "#EF4444", description: "Period of cultural rebirth" },
  { term: "enlightenment", category: "history", color: "#EF4444", description: "Age of reason and science" },

  // Philosophy (Indigo - #6366F1)
  { term: "logic", category: "philosophy", color: "#6366F1", description: "Study of reasoning" },
  { term: "ethics", category: "philosophy", color: "#6366F1", description: "Study of moral principles" },
  { term: "metaphysics", category: "philosophy", color: "#6366F1", description: "Study of reality and existence" },
  { term: "epistemology", category: "philosophy", color: "#6366F1", description: "Study of knowledge" },
  { term: "determinism", category: "philosophy", color: "#6366F1", description: "Theory that events are predetermined" },
  { term: "free will", category: "philosophy", color: "#6366F1", description: "Ability to make choices" },
  { term: "consciousness", category: "philosophy", color: "#6366F1", description: "State of awareness" },
  { term: "ontology", category: "philosophy", color: "#6366F1", description: "Study of being" },
  { term: "dialectic", category: "philosophy", color: "#6366F1", description: "Method of philosophical argument" },
  { term: "empiricism", category: "philosophy", color: "#6366F1", description: "Knowledge from experience" },

  // Psychology (Pink - #EC4899)
  { term: "cognition", category: "psychology", color: "#EC4899", description: "Mental processes of thinking" },
  { term: "behavior", category: "psychology", color: "#EC4899", description: "Observable actions" },
  { term: "conditioning", category: "psychology", color: "#EC4899", description: "Learning through association" },
  { term: "memory", category: "psychology", color: "#EC4899", description: "Process of storing information" },
  { term: "perception", category: "psychology", color: "#EC4899", description: "Interpretation of sensory input" },
  { term: "personality", category: "psychology", color: "#EC4899", description: "Individual patterns of thinking" },
  { term: "motivation", category: "psychology", color: "#EC4899", description: "Drive to act or behave" },
  { term: "attachment", category: "psychology", color: "#EC4899", description: "Emotional bond" },
  { term: "cognitive bias", category: "psychology", color: "#EC4899", description: "Systematic error in thinking" },
  { term: "neuroplasticity", category: "psychology", color: "#EC4899", description: "Brain's ability to reorganize" },

  // Economics (Amber - #F59E0B)
  { term: "supply and demand", category: "economics", color: "#F59E0B", description: "Market forces determining price" },
  { term: "inflation", category: "economics", color: "#F59E0B", description: "General increase in prices" },
  { term: "GDP", category: "economics", color: "#F59E0B", description: "Gross Domestic Product" },
  { term: "market economy", category: "economics", color: "#F59E0B", description: "Economy driven by supply and demand" },
  { term: "capitalism", category: "economics", color: "#F59E0B", description: "Private ownership economic system" },
  { term: "socialism", category: "economics", color: "#F59E0B", description: "Social ownership economic system" },
  { term: "monopoly", category: "economics", color: "#F59E0B", description: "Single seller in a market" },
  { term: "elasticity", category: "economics", color: "#F59E0B", description: "Responsiveness to price changes" },
  { term: "opportunity cost", category: "economics", color: "#F59E0B", description: "Cost of next best alternative" },
  { term: "fiscal policy", category: "economics", color: "#F59E0B", description: "Government spending and taxation" },

  // Art (Teal - #14B8A6)
  { term: "composition", category: "art", color: "#14B8A6", description: "Arrangement of visual elements" },
  { term: "perspective", category: "art", color: "#14B8A6", description: "Representation of 3D space" },
  { term: "chiaroscuro", category: "art", color: "#14B8A6", description: "Light and shadow contrast" },
  { term: "renaissance", category: "art", color: "#14B8A6", description: "European art movement" },
  { term: "impressionism", category: "art", color: "#14B8A6", description: "19th century art movement" },
  { term: "abstract", category: "art", color: "#14B8A6", description: "Non-representational art" },
  { term: "medium", category: "art", color: "#14B8A6", description: "Material used in artwork" },
  { term: "palette", category: "art", color: "#14B8A6", description: "Range of colors used" },
  { term: "texture", category: "art", color: "#14B8A6", description: "Surface quality" },
  { term: "symmetry", category: "art", color: "#14B8A6", description: "Balanced proportions" },

  // Language (Cyan - #06B6D4)
  { term: "syntax", category: "language", color: "#06B6D4", description: "Rules for sentence structure" },
  { term: "grammar", category: "language", color: "#06B6D4", description: "Rules of language" },
  { term: "phonetics", category: "language", color: "#06B6D4", description: "Study of speech sounds" },
  { term: "morphology", category: "language", color: "#06B6D4", description: "Study of word structure" },
  { term: "semantics", category: "language", color: "#06B6D4", description: "Study of meaning" },
  { term: "etymology", category: "language", color: "#06B6D4", description: "Origin and history of words" },
  { term: "dialect", category: "language", color: "#06B6D4", description: "Regional variety of language" },
  { term: "rhetoric", category: "language", color: "#06B6D4", description: "Art of persuasive speaking" },
  { term: "literary device", category: "language", color: "#06B6D4", description: "Technique used in writing" },
  { term: "conjugation", category: "language", color: "#06B6D4", description: "Verb form changes" },

  // General Academic (Gray - #6B7280)
  { term: "analysis", category: "general", color: "#6B7280", description: "Detailed examination" },
  { term: "synthesis", category: "general", color: "#6B7280", description: "Combining ideas" },
  { term: "evaluation", category: "general", color: "#6B7280", description: "Assessment of worth" },
  { term: "interpretation", category: "general", color: "#6B7280", description: "Explanation of meaning" },
  { term: "methodology", category: "general", color: "#6B7280", description: "System of methods" },
  { term: "theory", category: "general", color: "#6B7280", description: "Explanation of phenomena" },
  { term: "concept", category: "general", color: "#6B7280", description: "Abstract idea" },
  { term: "principle", category: "general", color: "#6B7280", description: "Fundamental truth" },
  { term: "criterion", category: "general", color: "#6B7280", description: "Standard for judgment" },
  { term: "paradigm", category: "general", color: "#6B7280", description: "Framework of ideas" },
  { term: "correlation", category: "general", color: "#6B7280", description: "Relationship between variables" },
  { term: "significance", category: "general", color: "#6B7280", description: "Importance or meaning" },
  { term: "context", category: "general", color: "#6B7280", description: "Surrounding circumstances" },
  { term: "evidence", category: "general", color: "#6B7280", description: "Information supporting conclusions" },
  { term: "conclusion", category: "general", color: "#6B7280", description: "Final judgment or decision" },
  { term: "assumption", category: "general", color: "#6B7280", description: "Something taken for granted" },
  { term: "implication", category: "general", color: "#6B7280", description: "Logical consequence" },
  { term: "perspective", category: "general", color: "#6B7280", description: "Point of view" },
  { term: "framework", category: "general", color: "#6B7280", description: "Basic structure" },
  { term: "dimension", category: "general", color: "#6B7280", description: "Aspect or feature" }
];

interface ParsedSegment {
  text: string;
  isTerm: boolean;
  term?: AcademicTerm;
  thoughtUnit: number;
}

interface AnalysisStats {
  totalSentences: number;
  totalTerms: number;
  totalWords: number;
  categoryCounts: Record<string, number>;
  uniqueTerms: number;
  subjectFocus: string;
  academicLevel: string;
}

// Subject detection based on term frequency
function detectSubjectFocus(categoryCounts: Record<string, number>): string {
  const totalTerms = Object.values(categoryCounts).reduce((sum, count) => sum + count, 0);
  if (totalTerms === 0) return "General";

  const percentages = Object.entries(categoryCounts).map(([category, count]) => ({
    category,
    percentage: (count / totalTerms) * 100
  }));

  percentages.sort((a, b) => b.percentage - a.percentage);

  const dominant = percentages[0];
  if (dominant.percentage > 40) {
    return dominant.category.charAt(0).toUpperCase() + dominant.category.slice(1);
  } else if (dominant.percentage > 25) {
    return `${dominant.category.charAt(0).toUpperCase() + dominant.category.slice(1)} (Mixed)`;
  } else {
    return "Interdisciplinary";
  }
}

function determineAcademicLevel(uniqueTerms: number, totalWords: number): string {
  const termDensity = (uniqueTerms / totalWords) * 100;
  
  if (termDensity > 15 || uniqueTerms > 25) return "Graduate/Advanced";
  if (termDensity > 8 || uniqueTerms > 15) return "Undergraduate";
  if (termDensity > 4 || uniqueTerms > 8) return "High School";
  return "Middle School/Introductory";
}

export function improveBiomedicalParsing(text: string): string {
  if (!text || text.trim().length === 0) {
    return '<div class="text-gray-500 italic p-4">No text content to analyze</div>';
  }

  // Clean and normalize text
  const normalizedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();

  // Split into sentences for thought unit analysis
  const sentences = normalizedText
    .split(/(?<=[.!?])\s+/)
    .filter(sentence => sentence.trim().length > 0);

  if (sentences.length === 0) {
    return '<div class="text-gray-500 italic p-4">No sentences found to analyze</div>';
  }

  const segments: ParsedSegment[] = [];
  let thoughtUnitCounter = 0;
  const foundTermsSet = new Set<string>();
  const categoryCounts: Record<string, number> = {};

  sentences.forEach((sentence) => {
    const foundTerms: Array<{ term: AcademicTerm; startIndex: number; endIndex: number }> = [];

    // Find all academic terms in this sentence
    academicTerms.forEach(termObj => {
      const regex = new RegExp(`\\b${termObj.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      let match;
      
      while ((match = regex.exec(sentence)) !== null) {
        foundTerms.push({
          term: termObj,
          startIndex: match.index,
          endIndex: match.index + match[0].length
        });
        
        // Track statistics
        foundTermsSet.add(termObj.term.toLowerCase());
        categoryCounts[termObj.category] = (categoryCounts[termObj.category] || 0) + 1;
      }
    });

    // Sort terms by position and remove overlaps
    foundTerms.sort((a, b) => a.startIndex - b.startIndex);
    const nonOverlappingTerms = foundTerms.filter((term, index) => {
      if (index === 0) return true;
      return term.startIndex >= foundTerms[index - 1].endIndex;
    });

    // Create segments for this sentence
    let lastIndex = 0;
    
    nonOverlappingTerms.forEach(({ term, startIndex, endIndex }) => {
      // Add text before the term
      if (startIndex > lastIndex) {
        const beforeText = sentence.slice(lastIndex, startIndex);
        if (beforeText.trim()) {
          segments.push({
            text: beforeText,
            isTerm: false,
            thoughtUnit: thoughtUnitCounter
          });
        }
      }

      // Add the term
      const termText = sentence.slice(startIndex, endIndex);
      segments.push({
        text: termText,
        isTerm: true,
        term: term,
        thoughtUnit: thoughtUnitCounter
      });

      lastIndex = endIndex;
    });

    // Add remaining text after the last term
    if (lastIndex < sentence.length) {
      const remainingText = sentence.slice(lastIndex);
      if (remainingText.trim()) {
        segments.push({
          text: remainingText,
          isTerm: false,
          thoughtUnit: thoughtUnitCounter
        });
      }
    }

    // If no terms were found, add the entire sentence
    if (nonOverlappingTerms.length === 0) {
      segments.push({
        text: sentence,
        isTerm: false,
        thoughtUnit: thoughtUnitCounter
      });
    }

    thoughtUnitCounter++;
  });

  // Calculate comprehensive statistics
  const totalWords = normalizedText.split(/\s+/).length;
  const totalTerms = segments.filter(s => s.isTerm).length;
  const subjectFocus = detectSubjectFocus(categoryCounts);
  const academicLevel = determineAcademicLevel(foundTermsSet.size, totalWords);

  const stats: AnalysisStats = {
    totalSentences: sentences.length,
    totalTerms,
    totalWords,
    categoryCounts,
    uniqueTerms: foundTermsSet.size,
    subjectFocus,
    academicLevel
  };

  // Generate HTML output with enhanced styling
  const htmlSegments = segments.map((segment) => {
    const thoughtUnitClass = segment.thoughtUnit % 2 === 0 ? 'bg-blue-50' : 'bg-gray-50';
    
    if (segment.isTerm && segment.term) {
      const subcategoryText = segment.term.subcategory ? ` (${segment.term.subcategory})` : '';
      return `<span class="inline-block px-2 py-1 rounded-md text-white font-medium shadow-sm mr-1 mb-1 cursor-help transition-all hover:scale-105" 
                    style="background-color: ${segment.term.color};" 
                    title="${segment.term.category.toUpperCase()}${subcategoryText}: ${segment.term.description || segment.term.term}">${segment.text}</span>`;
    } else {
      const baseColor = segment.thoughtUnit % 2 === 0 ? '#1F2937' : '#374151';
      return `<span style="color: ${baseColor}; padding: 2px;" class="${thoughtUnitClass} rounded px-1">${segment.text}</span>`;
    }
  });

  // Create enhanced legend with counts
  const categories = [...new Set(academicTerms.map(t => t.category))];
  const legend = categories.map(category => {
    const exampleTerm = academicTerms.find(t => t.category === category);
    const count = categoryCounts[category] || 0;
    const opacity = count > 0 ? '1' : '0.4';
    const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
    return `<span class="inline-flex items-center px-3 py-1 rounded-full text-white text-xs font-medium mr-2 mb-2 shadow-sm transition-opacity" 
                  style="background-color: ${exampleTerm?.color}; opacity: ${opacity}">
              ${categoryName} (${count})
            </span>`;
  }).join('');

  // Calculate density and complexity metrics
  const termDensity = ((totalTerms / totalWords) * 100).toFixed(1);

  return `
    <div class="space-y-6">
      <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-xl border border-blue-200">
        <h3 class="font-bold text-blue-800 mb-4 flex items-center">
          📊 Academic Analysis Results
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
          <div class="bg-white p-3 rounded-lg shadow-sm">
            <div class="font-semibold text-gray-700">Sentences</div>
            <div class="text-xl font-bold text-blue-600">${stats.totalSentences}</div>
          </div>
          <div class="bg-white p-3 rounded-lg shadow-sm">
            <div class="font-semibold text-gray-700">Academic Terms</div>
            <div class="text-xl font-bold text-green-600">${stats.totalTerms}</div>
          </div>
          <div class="bg-white p-3 rounded-lg shadow-sm">
            <div class="font-semibold text-gray-700">Unique Terms</div>
            <div class="text-xl font-bold text-purple-600">${stats.uniqueTerms}</div>
          </div>
          <div class="bg-white p-3 rounded-lg shadow-sm">
            <div class="font-semibold text-gray-700">Term Density</div>
            <div class="text-xl font-bold text-orange-600">${termDensity}%</div>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div class="bg-white p-3 rounded-lg shadow-sm">
            <div class="font-semibold text-gray-700">Subject Focus</div>
            <div class="text-lg font-bold text-indigo-600">${stats.subjectFocus}</div>
          </div>
          <div class="bg-white p-3 rounded-lg shadow-sm">
            <div class="font-semibold text-gray-700">Academic Level</div>
            <div class="text-lg font-bold text-teal-600">${stats.academicLevel}</div>
          </div>
        </div>
      </div>
      
      <div class="bg-gray-50 p-4 rounded-xl border">
        <h4 class="font-semibold text-gray-700 mb-3 flex items-center">
          🏷️ Academic Categories Found:
        </h4>
        <div class="flex flex-wrap">
          ${legend}
        </div>
      </div>
      
      <div class="prose max-w-none">
        <h4 class="font-semibold text-gray-800 mb-4 flex items-center">
          🧠 Analyzed Text (Thought Units):
        </h4>
        <div class="leading-relaxed text-sm bg-white p-4 rounded-lg border shadow-sm">
          ${htmlSegments.join('')}
        </div>
      </div>
      
      <div class="text-xs text-gray-500 bg-gray-100 p-3 rounded-lg">
        <div class="flex items-center mb-2">
          <span class="font-semibold">💡 Universal Analysis Guide:</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div><strong>Subject Detection:</strong> Automatically identifies academic focus</div>
          <div><strong>Level Assessment:</strong> Determines academic complexity</div>
          <div><strong>Multi-disciplinary:</strong> Works with all academic subjects</div>
          <div><strong>Hover Terms:</strong> See descriptions and categories</div>
        </div>
      </div>
    </div>
  `;
}

// Export for potential future use
export { academicTerms, type AcademicTerm, type AnalysisStats };