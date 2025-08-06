// types/chapter.ts

/**
 * Represents a chapter or section in a document.
 */
export interface Chapter {
  /**
   * The visible title of the chapter or section.
   */
  title: string;

  /**
   * Optional: The raw text content for this chapter.
   * Useful for search, summaries, or previews.
   */
  content?: string;

  /**
   * The page number in the PDF (0-indexed for pdf.js).
   */
  pageNumber?: number;

  /**
   * Optional: nested subchapters for hierarchical TOC.
   */
  subChapters?: Chapter[];

  /**
   * Optional: unique identifier for internal navigation.
   */
  id?: string;
}

// Keep default export for compatibility with existing imports
export default Chapter;