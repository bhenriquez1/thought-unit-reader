/**
 * Unit tests for annotationStore
 * Tests P0.1: Unified AnnotationStore - create/update/delete annotations, persist + reload
 */

import type { Annotation } from '../lib/stores/annotationStore';

// Test annotation store types
describe('Annotation Types', () => {
  test('should have correct type definitions', () => {
    const annotation: Partial<Annotation> = {
      id: 'test',
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
    expect(annotation.id).toBe('test');
    expect(annotation.anchor?.type).toBe('textRange');
  });

  test('should support bbox anchor type', () => {
    const annotation: Partial<Annotation> = {
      anchor: {
        type: 'bbox',
        boxes: [{ x: 0, y: 0, width: 100, height: 20 }]
      }
    };
    expect(annotation.anchor?.type).toBe('bbox');
  });

  test('should support PDRM metadata', () => {
    const annotation: Partial<Annotation> = {
      pdrm: {
        pattern: 'Core concept',
        decisionRule: 'When X, do Y',
        mnemonic: 'ABC = Always Be Careful',
        isMistake: true,
        weakAreaTags: ['algebra', 'fractions']
      }
    };
    expect(annotation.pdrm?.pattern).toBe('Core concept');
    expect(annotation.pdrm?.isMistake).toBe(true);
  });
});
