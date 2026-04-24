import { normalizePageText, filterSegmentsByPageRelevance } from '@/lib/page-intelligence/normalizer';
import type { Segment } from '@/lib/page-intelligence/types';

describe('page-intelligence normalizer', () => {
  it('repairs line-break hyphenation while preserving valid hyphenated terms', () => {
    const raw = `Page 12\nstruc-\nture and micro-\nscopic findings are relevant.\nUse dose-response and beta-blocker terms as-is.`;
    const out = normalizePageText(raw);

    expect(out.text).toContain('structure');
    expect(out.text).toContain('microscopic');
    expect(out.text).toContain('dose-response');
    expect(out.text).toContain('beta-blocker');
    expect(out.report.dehyphenatedWords).toBeGreaterThanOrEqual(2);
  });

  it('detects figure captions and flags relevance context', () => {
    const raw = `Figure 3. Receptor occupancy curve for agonist concentration\nThe pharmacodynamic relationship explains effect.`;
    const out = normalizePageText(raw);

    expect(out.figureContext.captions.length).toBe(1);
    expect(out.figureContext.relevant).toBe(true);
    expect(out.report.figureCaptionsDetected).toBe(1);
  });

  it('filters low-relevance segments against heading terms', () => {
    const segments: Segment[] = [
      { id: 'h1', pageNumber: 1, kind: 'heading', text: 'Beta Blockers in Pharmacology' },
      { id: 'p1', pageNumber: 1, kind: 'paragraph', text: 'Beta blockers reduce heart rate and myocardial oxygen demand.' },
      { id: 'p2', pageNumber: 1, kind: 'paragraph', text: 'Periodontal pocket depth criteria and gingival scaling steps.' },
    ];

    const filtered = filterSegmentsByPageRelevance(segments);

    expect(filtered.map((s) => s.id)).toContain('p1');
    expect(filtered.map((s) => s.id)).not.toContain('p2');
  });
});
