// Test file for autoPDRM classification logic
// Tests the classifyHighlight function from lib/autoPDRM.ts

import { classifyHighlight, getPDRMTypeColor, getPDRMTypeLabel, type PDRMType } from '../lib/autoPDRM';

// Test cases for classifyHighlight function
const testCases = [
  // Pattern tests
  {
    name: 'Pattern - Definition text',
    text: 'The principle of homeostasis is defined as the body\'s ability to maintain internal stability.',
    expectedType: 'pattern',
    minConfidence: 0.5
  },
  {
    name: 'Pattern - Concept explanation',
    text: 'The mechanism of action involves the pathway through which the drug affects cellular function.',
    expectedType: 'pattern',
    minConfidence: 0.5
  },
  
  // Decision tests
  {
    name: 'Decision - Treatment recommendation',
    text: 'First-line treatment should always include antibiotics when bacterial infection is confirmed.',
    expectedType: 'decision',
    minConfidence: 0.5
  },
  {
    name: 'Decision - Clinical guideline',
    text: 'The recommended protocol for management of hypertension must include lifestyle modifications.',
    expectedType: 'decision',
    minConfidence: 0.5
  },
  
  // Risk tests
  {
    name: 'Risk - Warning text',
    text: 'Warning: This medication has serious adverse effects and should never be used in patients with liver disease.',
    expectedType: 'risk',
    minConfidence: 0.6
  },
  {
    name: 'Risk - Common mistake',
    text: 'A common error in diagnosis is to overlook the subtle signs of early-stage disease.',
    expectedType: 'risk',
    minConfidence: 0.5
  },
  
  // Mnemonic tests
  {
    name: 'Mnemonic - Memory aid',
    text: 'Remember the ABC steps: 1. Airway, 2. Breathing, 3. Circulation.',
    expectedType: 'mnemonic',
    minConfidence: 0.5
  },
  {
    name: 'Mnemonic - Acronym',
    text: 'The FAST acronym helps recall: Face drooping, Arm weakness, Speech difficulty, Time to call.',
    expectedType: 'mnemonic',
    minConfidence: 0.5
  },
  
  // General tests (no strong signals)
  {
    name: 'General - Simple text',
    text: 'The patient presented with symptoms.',
    expectedType: 'general',
    minConfidence: 0.2
  }
];

// Run tests
console.log('🧪 Testing autoPDRM classifyHighlight function\n');

let passed = 0;
let failed = 0;

testCases.forEach((tc, idx) => {
  const result = classifyHighlight(tc.text);
  const typeMatch = result.type === tc.expectedType;
  const confidenceMatch = result.confidence >= tc.minConfidence;
  
  if (typeMatch && confidenceMatch) {
    console.log(`✅ Test ${idx + 1}: ${tc.name}`);
    console.log(`   Type: ${result.type} (expected: ${tc.expectedType})`);
    console.log(`   Confidence: ${result.confidence.toFixed(2)} (min: ${tc.minConfidence})`);
    console.log(`   Reason: ${result.reason}`);
    passed++;
  } else {
    console.log(`❌ Test ${idx + 1}: ${tc.name}`);
    console.log(`   Type: ${result.type} (expected: ${tc.expectedType}) ${typeMatch ? '✓' : '✗'}`);
    console.log(`   Confidence: ${result.confidence.toFixed(2)} (min: ${tc.minConfidence}) ${confidenceMatch ? '✓' : '✗'}`);
    console.log(`   Reason: ${result.reason}`);
    failed++;
  }
  console.log('');
});

// Test helper functions
console.log('🎨 Testing getPDRMTypeColor function');
const colors: Record<PDRMType, string> = {
  pattern: '#9333EA',
  decision: '#3B82F6',
  risk: '#EF4444',
  mnemonic: '#F59E0B',
  general: '#FFEB3B'
};

Object.entries(colors).forEach(([type, expectedColor]) => {
  const actualColor = getPDRMTypeColor(type as PDRMType);
  if (actualColor === expectedColor) {
    console.log(`✅ ${type}: ${actualColor}`);
    passed++;
  } else {
    console.log(`❌ ${type}: ${actualColor} (expected: ${expectedColor})`);
    failed++;
  }
});

console.log('\n📝 Testing getPDRMTypeLabel function');
const labels = getPDRMTypeLabel('pattern');
if (labels.short === 'P' && labels.full === 'Pattern' && labels.icon === '🎯') {
  console.log('✅ Pattern label correct');
  passed++;
} else {
  console.log('❌ Pattern label incorrect');
  failed++;
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
console.log(`Success rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
