// lib/parser.ts - Advanced Biochemistry Parser
interface BiomedicalTerm {
  term: string;
  category: 'enzyme' | 'process' | 'structure' | 'molecule' | 'pathway' | 'technique' | 'cofactor' | 'inhibitor';
  color: string;
  description?: string;
}

const biomedicalTerms: BiomedicalTerm[] = [
  // Enzymes (Blue - #3B82F6)
  { term: "enzyme-substrate complex", category: "enzyme", color: "#3B82F6", description: "Temporary complex formed between enzyme and substrate" },
  { term: "RNA polymerase", category: "enzyme", color: "#3B82F6", description: "Enzyme that synthesizes RNA from DNA template" },
  { term: "DNA polymerase", category: "enzyme", color: "#3B82F6", description: "Enzyme that synthesizes DNA strands" },
  { term: "ATP synthase", category: "enzyme", color: "#3B82F6", description: "Enzyme that produces ATP from ADP and phosphate" },
  { term: "cytochrome c oxidase", category: "enzyme", color: "#3B82F6", description: "Final enzyme in electron transport chain" },
  { term: "catalase", category: "enzyme", color: "#3B82F6", description: "Enzyme that breaks down hydrogen peroxide" },
  { term: "amylase", category: "enzyme", color: "#3B82F6", description: "Enzyme that breaks down starch" },
  { term: "pepsin", category: "enzyme", color: "#3B82F6", description: "Digestive enzyme that breaks down proteins" },
  { term: "trypsin", category: "enzyme", color: "#3B82F6", description: "Pancreatic enzyme that cleaves proteins" },
  { term: "chymotrypsin", category: "enzyme", color: "#3B82F6", description: "Digestive enzyme that cleaves peptide bonds" },
  { term: "lipase", category: "enzyme", color: "#3B82F6", description: "Enzyme that breaks down lipids" },
  { term: "phosphatase", category: "enzyme", color: "#3B82F6", description: "Enzyme that removes phosphate groups" },
  { term: "kinase", category: "enzyme", color: "#3B82F6", description: "Enzyme that adds phosphate groups" },
  { term: "dehydrogenase", category: "enzyme", color: "#3B82F6", description: "Enzyme that removes hydrogen atoms" },
  { term: "oxidase", category: "enzyme", color: "#3B82F6", description: "Enzyme that catalyzes oxidation reactions" },
  { term: "reductase", category: "enzyme", color: "#3B82F6", description: "Enzyme that catalyzes reduction reactions" },
  { term: "transferase", category: "enzyme", color: "#3B82F6", description: "Enzyme that transfers functional groups" },
  { term: "hydrolase", category: "enzyme", color: "#3B82F6", description: "Enzyme that uses water to break bonds" },
  { term: "isomerase", category: "enzyme", color: "#3B82F6", description: "Enzyme that rearranges molecular structure" },
  { term: "ligase", category: "enzyme", color: "#3B82F6", description: "Enzyme that joins molecules together" },

  // Processes (Green - #10B981)
  { term: "signal transduction", category: "process", color: "#10B981", description: "Process of cellular communication" },
  { term: "DNA replication", category: "process", color: "#10B981", description: "Process of copying DNA" },
  { term: "transcription", category: "process", color: "#10B981", description: "Process of making RNA from DNA" },
  { term: "translation", category: "process", color: "#10B981", description: "Process of making proteins from RNA" },
  { term: "oxidative phosphorylation", category: "process", color: "#10B981", description: "Process of ATP synthesis using oxygen" },
  { term: "apoptosis", category: "process", color: "#10B981", description: "Programmed cell death" },
  { term: "mitosis", category: "process", color: "#10B981", description: "Cell division process" },
  { term: "meiosis", category: "process", color: "#10B981", description: "Gamete formation process" },
  { term: "cell division", category: "process", color: "#10B981", description: "Process of one cell becoming two" },
  { term: "cellular respiration", category: "process", color: "#10B981", description: "Process of extracting energy from glucose" },
  { term: "photosynthesis", category: "process", color: "#10B981", description: "Process of converting light to chemical energy" },
  { term: "protein synthesis", category: "process", color: "#10B981", description: "Process of making proteins" },
  { term: "enzyme catalysis", category: "process", color: "#10B981", description: "Process of enzymatic reactions" },

  // Pathways (Purple - #8B5CF6)
  { term: "glycolysis", category: "pathway", color: "#8B5CF6", description: "Metabolic pathway that breaks down glucose" },
  { term: "citric acid cycle", category: "pathway", color: "#8B5CF6", description: "Central metabolic pathway" },
  { term: "Krebs cycle", category: "pathway", color: "#8B5CF6", description: "Another name for citric acid cycle" },
  { term: "electron transport chain", category: "pathway", color: "#8B5CF6", description: "Pathway for ATP synthesis" },
  { term: "Calvin cycle", category: "pathway", color: "#8B5CF6", description: "Photosynthetic carbon fixation pathway" },
  { term: "pentose phosphate pathway", category: "pathway", color: "#8B5CF6", description: "Alternative glucose metabolism pathway" },
  { term: "gluconeogenesis", category: "pathway", color: "#8B5CF6", description: "Pathway for glucose synthesis" },
  { term: "fatty acid synthesis", category: "pathway", color: "#8B5CF6", description: "Pathway for making fatty acids" },
  { term: "beta oxidation", category: "pathway", color: "#8B5CF6", description: "Pathway for breaking down fatty acids" },

  // Molecules (Red - #EF4444)
  { term: "adenosine triphosphate", category: "molecule", color: "#EF4444", description: "Energy currency of the cell" },
  { term: "ATP", category: "molecule", color: "#EF4444", description: "Adenosine triphosphate" },
  { term: "ADP", category: "molecule", color: "#EF4444", description: "Adenosine diphosphate" },
  { term: "NADH", category: "molecule", color: "#EF4444", description: "Reduced nicotinamide adenine dinucleotide" },
  { term: "NAD+", category: "molecule", color: "#EF4444", description: "Oxidized nicotinamide adenine dinucleotide" },
  { term: "FADH2", category: "molecule", color: "#EF4444", description: "Reduced flavin adenine dinucleotide" },
  { term: "FAD", category: "molecule", color: "#EF4444", description: "Flavin adenine dinucleotide" },
  { term: "glucose", category: "molecule", color: "#EF4444", description: "Simple sugar and energy source" },
  { term: "pyruvate", category: "molecule", color: "#EF4444", description: "Product of glycolysis" },
  { term: "acetyl-CoA", category: "molecule", color: "#EF4444", description: "Key metabolic intermediate" },
  { term: "hemoglobin", category: "molecule", color: "#EF4444", description: "Oxygen-carrying protein" },
  { term: "insulin", category: "molecule", color: "#EF4444", description: "Hormone that regulates glucose" },
  { term: "collagen", category: "molecule", color: "#EF4444", description: "Structural protein" },
  { term: "myosin", category: "molecule", color: "#EF4444", description: "Motor protein for muscle contraction" },
  { term: "actin", category: "molecule", color: "#EF4444", description: "Cytoskeletal protein" },

  // Structures (Indigo - #6366F1)
  { term: "mitochondria", category: "structure", color: "#6366F1", description: "Powerhouse of the cell" },
  { term: "ribosome", category: "structure", color: "#6366F1", description: "Protein synthesis machinery" },
  { term: "endoplasmic reticulum", category: "structure", color: "#6366F1", description: "Protein and lipid synthesis organelle" },
  { term: "cell membrane", category: "structure", color: "#6366F1", description: "Barrier that surrounds cells" },
  { term: "nucleus", category: "structure", color: "#6366F1", description: "Control center containing DNA" },
  { term: "chloroplast", category: "structure", color: "#6366F1", description: "Photosynthesis organelle" },
  { term: "Golgi apparatus", category: "structure", color: "#6366F1", description: "Protein modification organelle" },
  { term: "lysosome", category: "structure", color: "#6366F1", description: "Cellular digestion organelle" },
  { term: "cytoplasm", category: "structure", color: "#6366F1", description: "Gel-like substance in cells" },
  { term: "cell wall", category: "structure", color: "#6366F1", description: "Rigid structure around plant cells" },

  // Techniques/Concepts (Amber - #F59E0B)
  { term: "Michaelis-Menten kinetics", category: "technique", color: "#F59E0B", description: "Mathematical model of enzyme kinetics" },
  { term: "rate-limiting step", category: "technique", color: "#F59E0B", description: "Slowest step in a reaction pathway" },
  { term: "competitive inhibition", category: "technique", color: "#F59E0B", description: "Inhibitor competes with substrate" },
  { term: "non-competitive inhibition", category: "technique", color: "#F59E0B", description: "Inhibitor binds to different site" },
  { term: "allosteric regulation", category: "technique", color: "#F59E0B", description: "Regulation through conformational changes" },
  { term: "enzyme kinetics", category: "technique", color: "#F59E0B", description: "Study of enzyme reaction rates" },
  { term: "feedback inhibition", category: "technique", color: "#F59E0B", description: "Product inhibits its own synthesis" },
  { term: "cooperativity", category: "technique", color: "#F59E0B", description: "Binding of one ligand affects others" },

  // Cofactors (Teal - #14B8A6)
  { term: "coenzyme A", category: "cofactor", color: "#14B8A6", description: "Important metabolic cofactor" },
  { term: "biotin", category: "cofactor", color: "#14B8A6", description: "Vitamin B7, carboxylation cofactor" },
  { term: "thiamine", category: "cofactor", color: "#14B8A6", description: "Vitamin B1" },
  { term: "riboflavin", category: "cofactor", color: "#14B8A6", description: "Vitamin B2, precursor to FAD" },
  { term: "niacin", category: "cofactor", color: "#14B8A6", description: "Vitamin B3, precursor to NAD+" },
  { term: "magnesium", category: "cofactor", color: "#14B8A6", description: "Metal cofactor for many enzymes" },
  { term: "zinc", category: "cofactor", color: "#14B8A6", description: "Metal cofactor" },
  { term: "iron", category: "cofactor", color: "#14B8A6", description: "Metal cofactor in heme" },

  // Inhibitors (Pink - #EC4899)
  { term: "cyanide", category: "inhibitor", color: "#EC4899", description: "Inhibitor of cytochrome c oxidase" },
  { term: "oligomycin", category: "inhibitor", color: "#EC4899", description: "ATP synthase inhibitor" },
  { term: "rotenone", category: "inhibitor", color: "#EC4899", description: "Complex I inhibitor" },
  { term: "antimycin A", category: "inhibitor", color: "#EC4899", description: "Complex III inhibitor" },
];

interface ParsedSegment {
  text: string;
  isTerm: boolean;
  term?: BiomedicalTerm;
  thoughtUnit: number;
}

interface AnalysisStats {
  totalSentences: number;
  totalTerms: number;
  totalWords: number;
  categoryCounts: Record<string, number>;
  uniqueTerms: number;
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
    const foundTerms: Array<{ term: BiomedicalTerm; startIndex: number; endIndex: number }> = [];

    // Find all biomedical terms in this sentence
    biomedicalTerms.forEach(termObj => {
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
  const stats: AnalysisStats = {
    totalSentences: sentences.length,
    totalTerms,
    totalWords,
    categoryCounts,
    uniqueTerms: foundTermsSet.size
  };

  // Generate HTML output with enhanced styling
  const htmlSegments = segments.map((segment) => {
    const thoughtUnitClass = segment.thoughtUnit % 2 === 0 ? 'bg-blue-50' : 'bg-gray-50';
    
    if (segment.isTerm && segment.term) {
      return `<span class="inline-block px-2 py-1 rounded-md text-white font-medium shadow-sm mr-1 mb-1 cursor-help transition-all hover:scale-105" 
                    style="background-color: ${segment.term.color};" 
                    title="${segment.term.category.toUpperCase()}: ${segment.term.description || segment.term.term}">${segment.text}</span>`;
    } else {
      const baseColor = segment.thoughtUnit % 2 === 0 ? '#1F2937' : '#374151';
      return `<span style="color: ${baseColor}; padding: 2px;" class="${thoughtUnitClass} rounded px-1">${segment.text}</span>`;
    }
  });

  // Create enhanced legend with counts
  const categories = [...new Set(biomedicalTerms.map(t => t.category))];
  const legend = categories.map(category => {
    const exampleTerm = biomedicalTerms.find(t => t.category === category);
    const count = categoryCounts[category] || 0;
    const opacity = count > 0 ? '1' : '0.5';
    return `<span class="inline-flex items-center px-3 py-1 rounded-full text-white text-xs font-medium mr-2 mb-2 shadow-sm" 
                  style="background-color: ${exampleTerm?.color}; opacity: ${opacity}">
              ${category} (${count})
            </span>`;
  }).join('');

  // Calculate density and complexity metrics
  const termDensity = ((totalTerms / totalWords) * 100).toFixed(1);
  const complexity = stats.uniqueTerms > 15 ? 'High' : stats.uniqueTerms > 8 ? 'Medium' : 'Low';

  return `
    <div class="space-y-6">
      <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-xl border border-blue-200">
        <h3 class="font-bold text-blue-800 mb-4 flex items-center">
          📊 Advanced Analysis Results
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div class="bg-white p-3 rounded-lg shadow-sm">
            <div class="font-semibold text-gray-700">Sentences</div>
            <div class="text-xl font-bold text-blue-600">${stats.totalSentences}</div>
          </div>
          <div class="bg-white p-3 rounded-lg shadow-sm">
            <div class="font-semibold text-gray-700">Terms Found</div>
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
        <div class="mt-4 text-sm text-gray-600">
          <strong>Complexity Level:</strong> <span class="font-semibold ${complexity === 'High' ? 'text-red-600' : complexity === 'Medium' ? 'text-yellow-600' : 'text-green-600'}">${complexity}</span>
          | <strong>Scientific Focus:</strong> ${stats.uniqueTerms > 10 ? 'Highly Technical' : stats.uniqueTerms > 5 ? 'Moderate' : 'Basic'}
        </div>
      </div>
      
      <div class="bg-gray-50 p-4 rounded-xl border">
        <h4 class="font-semibold text-gray-700 mb-3 flex items-center">
          🏷️ Term Categories Found:
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
          <span class="font-semibold">💡 Analysis Guide:</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div><strong>Thought Units:</strong> Alternating backgrounds separate sentences</div>
          <div><strong>Hover Terms:</strong> See descriptions and categories</div>
          <div><strong>Color Coding:</strong> Each category has a unique color</div>
          <div><strong>Density:</strong> Higher % indicates more technical content</div>
        </div>
      </div>
    </div>
  `;
}

// Export for potential future use
export { biomedicalTerms, type BiomedicalTerm, type AnalysisStats };