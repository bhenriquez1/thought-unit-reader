// types/chapter.ts

/**
 * Represents a chapter in a document
 */
export interface Chapter {
  /**
   * The title of the chapter
   */
  title: string;
  
  /**
   * The content of the chapter as text
   */
  content: string;
  
  /**
   * The page number where the chapter starts (optional)
   */
  page?: number;
}

// Export default as well for flexibility
export default Chapter;