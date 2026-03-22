import { filterLearningNoise } from './contentFilter';
import { resolveDiscipline, type Discipline } from './disciplineResolver';

export type NormalizedParagraph = {
  id: string;
  page: number;
  text: string;
  role:
    | 'heading'
    | 'definition'
    | 'explanation'
    | 'example'
    | 'formula'
    | 'figure_caption'
    | 'table_caption'
    | 'citation'
    | 'boilerplate'
    | 'question'
    | 'timeline'
    | 'case_rule'
    | 'clinical_finding'
    | 'general';
  importanceScore: number;
  sourceRange?: {
    start?: number;
    end?: number;
  };
};

export type NormalizedPagePayload = {
  documentId: string;
  page: number;
  title?: string | null;
  headings: string[];
  cleanedText: string;
  paragraphs: NormalizedParagraph[];
  figures: Array<{ id: string; caption: string }>;
  tables: Array<{ id: string; caption: string }>;
  formulas: Array<{ id: string; expression: string }>;
  boilerplateFlags: string[];
  discipline: Discipline;
};

function inferRole(text: string): NormalizedParagraph['role'] {
  const lower = text.toLowerCase();
  if (/^[A-Z\d\s:.-]{4,}$/.test(text.trim())) return 'heading';
  if (/\b(definition|defined as|refers to)\b/.test(lower)) return 'definition';
  if (/\b(example|for instance|e\.g\.)\b/.test(lower)) return 'example';
  if (/\b(fig\.?|figure)\b/.test(lower)) return 'figure_caption';
  if (/\btable\b/.test(lower)) return 'table_caption';
  if (/\b(therefore|thus|because|mechanism)\b/.test(lower)) return 'explanation';
  if (/\b(case|holding|rule)\b/.test(lower)) return 'case_rule';
  if (/\b(patient|finding|clinical)\b/.test(lower)) return 'clinical_finding';
  if (/\b(\d+\s*[=+\-/*]\s*\d+|\b[a-z]\s*=\s*)\b/i.test(text)) return 'formula';
  return 'general';
}

export function normalizePagePayload(input: {
  documentId: string;
  page: number;
  title?: string | null;
  text: string;
}): NormalizedPagePayload {
  const cleanedText = filterLearningNoise(input.text);
  const lines = cleanedText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const headings = lines.filter((line) => /^[A-Z\d\s:.-]{4,}$/.test(line)).slice(0, 8);

  const paragraphs = lines.map((line, index): NormalizedParagraph => {
    const role = inferRole(line);
    const importanceScore = Math.min(1, Math.max(0.1, line.length / 280 + (role === 'definition' || role === 'case_rule' ? 0.25 : 0)));
    return {
      id: `${input.documentId}:${input.page}:${index}`,
      page: input.page,
      text: line,
      role,
      importanceScore,
      sourceRange: { start: index, end: index + 1 },
    };
  });

  const discipline = resolveDiscipline(cleanedText);

  return {
    documentId: input.documentId,
    page: input.page,
    title: input.title ?? null,
    headings,
    cleanedText,
    paragraphs,
    figures: paragraphs.filter((p) => p.role === 'figure_caption').map((p) => ({ id: p.id, caption: p.text })),
    tables: paragraphs.filter((p) => p.role === 'table_caption').map((p) => ({ id: p.id, caption: p.text })),
    formulas: paragraphs.filter((p) => p.role === 'formula').map((p) => ({ id: p.id, expression: p.text })),
    boilerplateFlags: input.text && input.text !== cleanedText ? ['noise_removed'] : [],
    discipline,
  };
}
