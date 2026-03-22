import { sanitizeRenderText } from './sanitizeRenderText';

type ParagraphUnit = { id: string; text?: string | null };

export type HighlightAnchor = {
  cardId: string;
  pageNumber: number | null;
  paragraphId: string;
  anchorIds: string[];
  snippet: string;
  bbox?: { x: number; y: number; w: number; h: number };
};

export function buildHighlightAnchors(args: {
  pageNumber?: number;
  paragraphUnits: ParagraphUnit[] | null | undefined;
  cards: Array<{ id: string; text?: string | null; title?: string | null; claim?: string | null }>;
}): HighlightAnchor[] {
  const units = args.paragraphUnits ?? [];
  if (!units.length) return [];

  return args.cards
    .map((card) => {
      const cardText = sanitizeRenderText(card.text ?? card.claim ?? card.title ?? '');
      if (!cardText) return null;
      const needle = cardText.toLowerCase();
      const match = units.find((unit) => unit.text && sanitizeRenderText(unit.text).toLowerCase().includes(needle.slice(0, 48)));
      if (!match) return null;
      return {
        cardId: card.id,
        pageNumber: args.pageNumber ?? null,
        paragraphId: match.id,
        anchorIds: [`p${args.pageNumber ?? 0}:${match.id}`],
        snippet: sanitizeRenderText(match.text ?? '').slice(0, 180),
      };
    })
    .filter((anchor): anchor is HighlightAnchor => !!anchor);
}
