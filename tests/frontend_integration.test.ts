/**
 * Frontend Integration Tests for Surgeon View + NoteLab
 * Tests P0.1: Unified AnnotationStore - create/update/delete annotations
 * Tests P0.2: Highlight creation - text selection shows action menu
 * 
 * Run with: npx tsx tests/frontend_integration.test.ts
 */

import { 
  useAnnotationStore, 
  type CreateAnnotationInput, 
  type Annotation,
  type PDRMMetadata 
} from '../lib/stores/annotationStore';

// Simple test runner
let passCount = 0;
let failCount = 0;

function describe(name: string, fn: () => void | Promise<void>) {
  console.log(`\n📦 ${name}`);
  fn();
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passCount++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.error(`     Error: ${error}`);
    failCount++;
  }
}

function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected} but got ${actual}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error(`Expected value to be defined but got undefined`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null but got ${actual}`);
      }
    },
    toHaveLength(expected: number) {
      if (!Array.isArray(actual) || actual.length !== expected) {
        throw new Error(`Expected array of length ${expected} but got ${Array.isArray(actual) ? actual.length : 'not an array'}`);
      }
    },
    toEqual(expected: T) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toContain(item: any) {
      if (!Array.isArray(actual) || !actual.includes(item)) {
        throw new Error(`Expected array to contain ${item}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof actual !== 'number' || actual <= expected) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value but got ${actual}`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy value but got ${actual}`);
      }
    }
  };
}

// Mock localStorage for testing
const localStorageMock: Record<string, string> = {};
if (typeof window === 'undefined') {
  (global as any).localStorage = {
    getItem: (key: string) => localStorageMock[key] || null,
    setItem: (key: string, value: string) => { localStorageMock[key] = value; },
    removeItem: (key: string) => { delete localStorageMock[key]; },
    clear: () => { Object.keys(localStorageMock).forEach(k => delete localStorageMock[k]); }
  };
}

console.log('\n🧪 Frontend Integration Test Suite\n');
console.log('Testing P0.1: Unified AnnotationStore');
console.log('Testing P0.2: Highlight creation workflow\n');

// ============================================================================
// P0.1: Unified AnnotationStore Tests
// ============================================================================

describe('P0.1: Annotation Store - Type Definitions', () => {
  test('should have correct Annotation type structure', async () => {
    const annotation: Partial<Annotation> = {
      id: 'test-id',
      documentId: 'doc1',
      chapterId: 'ch1',
      pageIndex: 0,
      selectedText: 'Test text',
      anchor: { type: 'textRange', start: 0, end: 10 },
      pdrm: {
        pattern: 'test pattern',
        decisionRule: undefined,
        mnemonic: undefined,
        isMistake: false
      },
      color: '#FFEB3B',
      tags: ['test'],
      userId: 'user1'
    };
    expect(annotation.id).toBe('test-id');
    expect(annotation.anchor?.type).toBe('textRange');
    expect(annotation.pdrm?.pattern).toBe('test pattern');
  });

  test('should support bbox anchor type', async () => {
    const annotation: Partial<Annotation> = {
      anchor: {
        type: 'bbox',
        boxes: [{ x: 0, y: 0, width: 100, height: 20 }]
      }
    };
    expect(annotation.anchor?.type).toBe('bbox');
  });

  test('should support PDRM metadata structure', async () => {
    const pdrm: PDRMMetadata = {
      pattern: 'Core concept',
      decisionRule: 'When X, do Y',
      mnemonic: 'ABC = Always Be Careful',
      isMistake: true,
      weakAreaTags: ['algebra', 'fractions']
    };
    expect(pdrm.pattern).toBe('Core concept');
    expect(pdrm.isMistake).toBe(true);
    expect(pdrm.weakAreaTags?.length).toBe(2);
  });
});

describe('P0.1: Annotation Store - CreateAnnotationInput', () => {
  test('should have correct CreateAnnotationInput type', async () => {
    const input: CreateAnnotationInput = {
      documentId: 'doc1',
      chapterId: 'ch1',
      pageIndex: 0,
      selectedText: 'Test text',
      anchor: { type: 'textRange', start: 0, end: 10 },
      pdrm: {},
      color: '#FFEB3B',
      tags: [],
      userId: 'guest'
    };
    expect(input.documentId).toBe('doc1');
    expect(input.chapterId).toBe('ch1');
    expect(input.pageIndex).toBe(0);
  });
});

describe('P0.1: Annotation Store - Store State', () => {
  test('should have initial state with empty annotations', async () => {
    const store = useAnnotationStore.getState();
    expect(typeof store.annotations).toBe('object');
    expect(store.activeDocumentId).toBeNull();
    expect(store.activeChapterId).toBeNull();
    expect(store.activePageIndex).toBe(0);
  });

  test('should have view mode with default values', async () => {
    const store = useAnnotationStore.getState();
    expect(store.viewMode.mode).toBe('full');
    expect(store.viewMode.showOnlyHighlights).toBe(false);
    expect(store.viewMode.showHeadings).toBe(true);
  });

  test('should have pending highlight as null initially', async () => {
    const store = useAnnotationStore.getState();
    expect(store.pendingHighlight).toBeNull();
  });
});

describe('P0.1: Annotation Store - CRUD Operations', () => {
  test('should add annotation and return ID', async () => {
    const store = useAnnotationStore.getState();
    
    // Set active document first
    store.setActiveChapter('test-chapter');
    
    const input: CreateAnnotationInput = {
      documentId: 'test-doc',
      chapterId: 'test-chapter',
      pageIndex: 1,
      selectedText: 'Test highlight text',
      anchor: { type: 'textRange', start: 5, end: 25 },
      pdrm: { pattern: 'Test pattern' },
      color: '#FFEB3B',
      tags: ['test'],
      userId: 'guest'
    };
    
    const id = await store.addAnnotation(input);
    expect(id).toBeDefined();
    expect(id.startsWith('ann_')).toBe(true);
    
    // Verify annotation was added
    const updatedStore = useAnnotationStore.getState();
    const annotation = updatedStore.annotations[id];
    expect(annotation).toBeDefined();
    expect(annotation.selectedText).toBe('Test highlight text');
    expect(annotation.pdrm?.pattern).toBe('Test pattern');
  });

  test('should update annotation', async () => {
    const store = useAnnotationStore.getState();
    
    // Add an annotation first
    const input: CreateAnnotationInput = {
      documentId: 'test-doc',
      chapterId: 'test-chapter',
      pageIndex: 2,
      selectedText: 'Original text',
      anchor: { type: 'textRange', start: 0, end: 13 },
      pdrm: {},
      color: '#FFEB3B',
      tags: [],
      userId: 'guest'
    };
    
    const id = await store.addAnnotation(input);
    
    // Update the annotation
    await store.updateAnnotation(id, {
      color: '#9333EA',
      pdrm: { pattern: 'Updated pattern' }
    });
    
    // Verify update
    const updatedStore = useAnnotationStore.getState();
    const annotation = updatedStore.annotations[id];
    expect(annotation.color).toBe('#9333EA');
    expect(annotation.pdrm?.pattern).toBe('Updated pattern');
  });

  test('should delete annotation', async () => {
    const store = useAnnotationStore.getState();
    
    // Add an annotation first
    const input: CreateAnnotationInput = {
      documentId: 'test-doc',
      chapterId: 'test-chapter',
      pageIndex: 3,
      selectedText: 'To be deleted',
      anchor: { type: 'textRange', start: 0, end: 13 },
      pdrm: {},
      color: '#FFEB3B',
      tags: [],
      userId: 'guest'
    };
    
    const id = await store.addAnnotation(input);
    
    // Verify it exists
    let currentStore = useAnnotationStore.getState();
    expect(currentStore.annotations[id]).toBeDefined();
    
    // Delete the annotation
    await store.deleteAnnotation(id);
    
    // Verify deletion
    currentStore = useAnnotationStore.getState();
    expect(currentStore.annotations[id]).toBe(undefined);
  });
});

describe('P0.1: Annotation Store - Getters', () => {
  test('should get annotations for page', async () => {
    const store = useAnnotationStore.getState();
    
    // Add annotations for different pages
    await store.addAnnotation({
      documentId: 'test-doc',
      chapterId: 'test-chapter',
      pageIndex: 10,
      selectedText: 'Page 10 text',
      anchor: { type: 'textRange', start: 0, end: 12 },
      pdrm: {},
      color: '#FFEB3B',
      tags: [],
      userId: 'guest'
    });
    
    await store.addAnnotation({
      documentId: 'test-doc',
      chapterId: 'test-chapter',
      pageIndex: 10,
      selectedText: 'Another page 10 text',
      anchor: { type: 'textRange', start: 20, end: 40 },
      pdrm: {},
      color: '#FFEB3B',
      tags: [],
      userId: 'guest'
    });
    
    const page10Annotations = store.getAnnotationsForPage(10);
    expect(page10Annotations.length).toBeGreaterThan(0);
  });

  test('should get all highlights', async () => {
    const store = useAnnotationStore.getState();
    const highlights = store.getHighlightsOnly();
    expect(Array.isArray(highlights)).toBe(true);
  });

  test('should get PDRM annotations by type', async () => {
    const store = useAnnotationStore.getState();
    
    // Add annotation with pattern
    await store.addAnnotation({
      documentId: 'test-doc',
      chapterId: 'test-chapter',
      pageIndex: 20,
      selectedText: 'Pattern text',
      anchor: { type: 'textRange', start: 0, end: 12 },
      pdrm: { pattern: 'Test pattern' },
      color: '#9333EA',
      tags: [],
      userId: 'guest'
    });
    
    const patternAnnotations = store.getPDRMAnnotations('P');
    expect(patternAnnotations.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// P0.2: Highlight Creation Workflow Tests
// ============================================================================

describe('P0.2: Highlight Creation - Pending Highlight', () => {
  test('should set pending highlight', async () => {
    const store = useAnnotationStore.getState();
    
    store.setPendingHighlight({
      selectedText: 'Selected text for highlight',
      pageIndex: 5,
      anchor: { type: 'textRange', start: 10, end: 37 },
      chapterId: 'test-chapter'
    });
    
    const updatedStore = useAnnotationStore.getState();
    expect(updatedStore.pendingHighlight).toBeDefined();
    expect(updatedStore.pendingHighlight?.selectedText).toBe('Selected text for highlight');
    expect(updatedStore.pendingHighlight?.pageIndex).toBe(5);
  });

  test('should cancel pending highlight', async () => {
    const store = useAnnotationStore.getState();
    
    // Set pending highlight
    store.setPendingHighlight({
      selectedText: 'To be cancelled',
      pageIndex: 6,
      anchor: { type: 'textRange', start: 0, end: 15 }
    });
    
    // Cancel it
    store.cancelHighlight();
    
    const updatedStore = useAnnotationStore.getState();
    expect(updatedStore.pendingHighlight).toBeNull();
  });

  test('should confirm highlight and create annotation', async () => {
    const store = useAnnotationStore.getState();
    
    // Set active document (required for confirmHighlight)
    await store.setActiveDocument('confirm-test-doc', 'guest');
    store.setActiveChapter('confirm-test-chapter');
    
    // Set pending highlight
    store.setPendingHighlight({
      selectedText: 'Confirmed highlight text',
      pageIndex: 7,
      anchor: { type: 'textRange', start: 0, end: 24 },
      chapterId: 'confirm-test-chapter'
    });
    
    // Confirm with options
    const id = await store.confirmHighlight({
      userId: 'guest',
      pdrm: { pattern: 'Confirmed pattern' },
      color: '#3B82F6'
    });
    
    expect(id).toBeDefined();
    
    // Verify annotation was created
    const updatedStore = useAnnotationStore.getState();
    if (id) {
      const annotation = updatedStore.annotations[id];
      expect(annotation.selectedText).toBe('Confirmed highlight text');
      expect(annotation.pdrm?.pattern).toBe('Confirmed pattern');
    }
    
    // Verify pending highlight was cleared
    expect(updatedStore.pendingHighlight).toBeNull();
  });
});

describe('P0.2: PDRM Tagging', () => {
  test('should add PDRM tag to annotation', async () => {
    const store = useAnnotationStore.getState();
    
    // Create annotation
    const id = await store.addAnnotation({
      documentId: 'pdrm-test-doc',
      chapterId: 'pdrm-test-chapter',
      pageIndex: 30,
      selectedText: 'PDRM test text',
      anchor: { type: 'textRange', start: 0, end: 14 },
      pdrm: {},
      color: '#FFEB3B',
      tags: [],
      userId: 'guest'
    });
    
    // Add Pattern tag
    await store.addPDRMTag(id, 'P', 'Core principle');
    
    const updatedStore = useAnnotationStore.getState();
    const annotation = updatedStore.annotations[id];
    expect(annotation.pdrm?.pattern).toBe('Core principle');
    expect(annotation.color).toBe('#9333EA'); // Purple for Pattern
  });

  test('should add Decision tag', async () => {
    const store = useAnnotationStore.getState();
    
    const id = await store.addAnnotation({
      documentId: 'pdrm-test-doc',
      chapterId: 'pdrm-test-chapter',
      pageIndex: 31,
      selectedText: 'Decision test',
      anchor: { type: 'textRange', start: 0, end: 13 },
      pdrm: {},
      color: '#FFEB3B',
      tags: [],
      userId: 'guest'
    });
    
    await store.addPDRMTag(id, 'D', 'When X, do Y');
    
    const updatedStore = useAnnotationStore.getState();
    const annotation = updatedStore.annotations[id];
    expect(annotation.pdrm?.decisionRule).toBe('When X, do Y');
    expect(annotation.color).toBe('#3B82F6'); // Blue for Decision
  });

  test('should add Mistake/Risk tag', async () => {
    const store = useAnnotationStore.getState();
    
    const id = await store.addAnnotation({
      documentId: 'pdrm-test-doc',
      chapterId: 'pdrm-test-chapter',
      pageIndex: 32,
      selectedText: 'Mistake test',
      anchor: { type: 'textRange', start: 0, end: 12 },
      pdrm: {},
      color: '#FFEB3B',
      tags: [],
      userId: 'guest'
    });
    
    await store.addPDRMTag(id, 'R', 'Common mistake');
    
    const updatedStore = useAnnotationStore.getState();
    const annotation = updatedStore.annotations[id];
    expect(annotation.pdrm?.isMistake).toBe(true);
    expect(annotation.color).toBe('#EF4444'); // Red for Risk/Mistake
  });

  test('should remove PDRM tag', async () => {
    const store = useAnnotationStore.getState();
    
    const id = await store.addAnnotation({
      documentId: 'pdrm-test-doc',
      chapterId: 'pdrm-test-chapter',
      pageIndex: 33,
      selectedText: 'Remove tag test',
      anchor: { type: 'textRange', start: 0, end: 15 },
      pdrm: { pattern: 'To be removed' },
      color: '#9333EA',
      tags: [],
      userId: 'guest'
    });
    
    await store.removePDRMTag(id, 'P');
    
    const updatedStore = useAnnotationStore.getState();
    const annotation = updatedStore.annotations[id];
    expect(annotation.pdrm?.pattern).toBe(undefined);
  });
});

describe('P0.2: View Mode', () => {
  test('should toggle clean mode', async () => {
    const store = useAnnotationStore.getState();
    
    // Initial mode should be 'full'
    expect(store.viewMode.mode).toBe('full');
    
    // Toggle to clean mode
    store.toggleCleanMode();
    
    let updatedStore = useAnnotationStore.getState();
    expect(updatedStore.viewMode.mode).toBe('clean');
    expect(updatedStore.viewMode.showOnlyHighlights).toBe(true);
    
    // Toggle back to full mode
    store.toggleCleanMode();
    
    updatedStore = useAnnotationStore.getState();
    expect(updatedStore.viewMode.mode).toBe('full');
  });

  test('should set view mode options', async () => {
    const store = useAnnotationStore.getState();
    
    store.setViewMode({
      showHeadings: false,
      contextSentences: 3
    });
    
    const updatedStore = useAnnotationStore.getState();
    expect(updatedStore.viewMode.showHeadings).toBe(false);
    expect(updatedStore.viewMode.contextSentences).toBe(3);
  });
});

describe('P0.2: Selection State', () => {
  test('should select annotation', async () => {
    const store = useAnnotationStore.getState();
    
    const id = await store.addAnnotation({
      documentId: 'select-test-doc',
      chapterId: 'select-test-chapter',
      pageIndex: 40,
      selectedText: 'Selection test',
      anchor: { type: 'textRange', start: 0, end: 14 },
      pdrm: {},
      color: '#FFEB3B',
      tags: [],
      userId: 'guest'
    });
    
    store.selectAnnotation(id);
    
    const updatedStore = useAnnotationStore.getState();
    expect(updatedStore.selectedAnnotationId).toBe(id);
  });

  test('should deselect annotation', async () => {
    const store = useAnnotationStore.getState();
    
    store.selectAnnotation(null);
    
    const updatedStore = useAnnotationStore.getState();
    expect(updatedStore.selectedAnnotationId).toBeNull();
  });
});

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log('📊 Test Summary');
console.log('='.repeat(60));
console.log(`✅ Passed: ${passCount}`);
console.log(`❌ Failed: ${failCount}`);
console.log(`📈 Total: ${passCount + failCount}`);
console.log('='.repeat(60));

if (failCount > 0) {
  console.log('\n⚠️ Some tests failed. Please review the errors above.');
  process.exit(1);
} else {
  console.log('\n🎉 All tests passed!');
  process.exit(0);
}
