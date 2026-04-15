/**
 * buildSemanticPage.ts
 *
 * Type definitions for the semantic page model.
 * The full builder implementation will attach these types once the
 * text-extraction pipeline exposes raw PDF.js text items.
 */

export type SemanticSentence = {
  id: string
  text: string
  /** Character offset within the page's concatenated text stream */
  startOffset: number
  endOffset: number
  /** Parent paragraph id */
  paragraphId: string
}

export type SemanticParagraph = {
  id: string
  text: string
  /** Character offset within the page's concatenated text stream */
  startOffset: number
  endOffset: number
  /** Sentences belonging to this paragraph, in reading order */
  sentenceIds: string[]
}

export type SemanticPage = {
  pageNumber: number
  /** All sentences on the page, in reading order */
  sentences: SemanticSentence[]
  /** All paragraphs on the page, in reading order */
  paragraphs: SemanticParagraph[]
}
