typescript// lib/parser.ts
interface BiomedicalTerm {
  term: string;
  category: 'enzyme' | 'process' | 'structure' | 'molecule' | 'pathway' | 'technique';
  color: string;
}

const biomedicalTerms: BiomedicalTerm[] = [
  // Enzymes
  { term: "enzyme-substrate complex", category: "enzyme", color: "#3B82F6" },
  { term: "RNA polymerase", category: "enzyme", color: "#3B82F6" },
  { term: "DNA polymerase", category: "enzyme", color: "#3B82F6" },
  { term: "ATP synthase", category: "enzyme", color: "#3B82F6" },
  
  // Processes
  { term: "signal transduction", category: "process", color: "#10B981" },
  { term: "DNA replication", category: "process", color: "#10B981" },
  { term: "transcription", category: "process", color: "#10B981" },
  { term: "translation", category: "process", color: "#10B981" },
  { term: "oxidative phosphorylation", category: "process", color: "#10B981" },
  { term: "apoptosis", category: "process", color: "#10B981" },
  
  // Pathways
  { term: "glycolysis", category: "pathway", color: "#8B5CF6" },
  { term: "citric acid cycle", category: "pathway", color: "#8B5CF6" },
  { term: "electron transport chain", category: "pathway", color: "#8B5CF6" },
  
  // Techniques
  { term: "Michaelis-Menten kinetics", category: "technique", color: "#F59E0B" },
  { term: "rate-limiting step", category: "technique", color: "#F59E0B" },
  
  // Molecules
  { term: "ATP", category: "molecule", color: "#EF4444" },
  { term: "NADH", category: "molecule", color: "#EF4444" },
  { term: "glucose", category: "molecule", color: "#EF4444" },
  
  // Structures
  { term: "mitochondria", category: "structure", color: "#6366F1" },
  { term: "ribosome", category: "structure", color: "#6366F1" },
  { term: "nucleus", category: "structure", color: "#6366F1" },
];

export function improveBiomedicalParsing(text: string): string {
  if (!text || text.trim().length === 0) {
    return '<div class="text-gray-500 italic">No text content to analyze</div>';
  }

  const normalizedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();

  const sentences = normalizedText
    .split(/(?<=[.!?])\s+/)
    .filter(sentence => sentence.trim().length > 0);

  if (sentences.length === 0) {
    return '<div class="text-gray-500 italic">No sentences found to analyze</div>';
  }

  let htmlOutput = '';
  let thoughtUnitCounter = 0;

  sentences.forEach((sentence) => {
    let processedSentence = sentence;
    const foundTerms: Array<{ term: BiomedicalTerm; startIndex: number; endIndex: number }> = [];

    // Find all biomedical terms
    biomedicalTerms.forEach(termObj => {
      const regex = new RegExp(`\\b${termObj.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      let match;
      
      while ((match = regex.exec(sentence)) !== null) {
        foundTerms.push({
          term: termObj,
          startIndex: match.index,
          endIndex: match.index + match[0].length
        });
      }
    });

    // Sort and remove overlaps
    foundTerms.sort((a, b) => a.startIndex - b.startIndex);
    const nonOverlappingTerms = foundTerms.filter((term, index) => {
      if (index === 0) return true;
      return term.startIndex >= foundTerms[index - 1].endIndex;
    });

    // Generate HTML for this sentence
    let lastIndex = 0;
    const thoughtUnitClass = thoughtUnitCounter % 2 === 0 ? 'bg-blue-50' : 'bg-gray-50';
    
    nonOverlappingTerms.forEach(({ term, startIndex, endIndex }) => {
      // Add text before term
      if (startIndex > lastIndex) {
        const beforeText = sentence.slice(lastIndex, startIndex);
        if (beforeText.trim()) {
          htmlOutput += `<span class="${thoughtUnitClass} rounded px-1">${beforeText}</span>`;
        }
      }

      // Add highlighted term
      const termText = sentence.slice(startIndex, endIndex);
      htmlOutput += `<span class="px-2 py-1 rounded-md text-white font-medium shadow-sm" 
                           style="background-color: ${term.color}" 
                           title="Category: ${term.category}">${termText}</span>`;

      lastIndex = endIndex;
    });

    // Add remaining text
    if (lastIndex < sentence.length) {
      const remainingText = sentence.slice(lastIndex);
      if (remainingText.trim()) {
        htmlOutput += `<span class="${thoughtUnitClass} rounded px-1">${remainingText}</span>`;
      }
    }

    // If no terms found, add entire sentence
    if (nonOverlappingTerms.length === 0) {
      htmlOutput += `<span class="${thoughtUnitClass} rounded px-1">${sentence}</span>`;
    }

    htmlOutput += ' ';
    thoughtUnitCounter++;
  });

  // Add stats and legend
  const totalTerms = sentences.reduce((count, sentence) => {
    return count + biomedicalTerms.filter(term => 
      new RegExp(`\\b${term.term}\\b`, 'i').test(sentence)
    ).length;
  }, 0);

  const categories = [...new Set(biomedicalTerms.map(t => t.category))];
  const legend = categories.map(category => {
    const exampleTerm = biomedicalTerms.find(t => t.category === category);
    return `<span class="inline-flex items-center px-2 py-1 rounded-md text-white text-xs font-medium mr-2 mb-1" 
                  style="background-color: ${exampleTerm?.color}">
              ${category}
            </span>`;
  }).join('');

  return `
    <div class="space-y-4">
      <div class="bg-blue-50 p-4 rounded-lg border border-blue-200">
        <h3 class="font-semibold text-blue-800 mb-2">Analysis Overview</h3>
        <div class="grid grid-cols-3 gap-4 text-sm">
          <div><strong>Sentences:</strong> ${sentences.length}</div>
          <div><strong>Terms Found:</strong> ${totalTerms}</div>
          <div><strong>Categories:</strong> ${categories.length}</div>
        </div>
      </div>
      
      <div class="bg-gray-50 p-3 rounded-lg border">
        <h4 class="font-medium text-gray-700 mb-2">Term Categories:</h4>
        <div class="flex flex-wrap">
          ${legend}
        </div>
      </div>
      
      <div class="prose max-w-none">
        <h4 class="font-medium text-gray-800 mb-3">Thought-Unit Analysis:</h4>
        <div class="leading-relaxed text-sm">
          ${htmlOutput}
        </div>
      </div>
      
      <div class="text-xs text-gray-500 mt-4 p-2 bg-gray-100 rounded">
        💡 <strong>Thought Units:</strong> Alternating background colors indicate different sentences. 
        <strong>Biomedical Terms:</strong> Highlighted by category. Hover for details.
      </div>
    </div>
  `;
}

export { biomedicalTerms, type BiomedicalTerm };