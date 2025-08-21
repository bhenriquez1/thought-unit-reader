// lib/libraryService.ts
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  Timestamp 
} from "firebase/firestore";
import { db } from "./firebase";

export interface LibraryItem {
  id: string;
  userId: string;
  bookId: string;
  type: 'note' | 'mindmap' | 'highlight' | 'summary' | 'flashcard' | 'top-student-note';
  title: string;
  content: string;
  pageNumber?: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    // For highlights
    selectedText?: string;
    color?: string;
    position?: { x: number; y: number };
    
    // For mindmaps
    nodes?: any[];
    edges?: any[];
    
    // For top student notes
    difficulty?: 'easy' | 'medium' | 'hard';
    subject?: string;
    keyPoints?: string[];
    mnemonics?: string[];
    visualAids?: string[];
    
    // For summaries
    wordCount?: number;
    readingTime?: number;
  };
}

export interface TopStudentNote extends LibraryItem {
  type: 'top-student-note';
  metadata: {
    difficulty: 'easy' | 'medium' | 'hard';
    subject: string;
    keyPoints: string[];
    mnemonics: string[];
    visualAids: string[];
    studyTips: string[];
    commonMistakes: string[];
    examTips: string[];
    relatedConcepts: string[];
    confidenceScore: number; // 1-10
  };
}

class LibraryService {
  private getCollectionRef(userId: string) {
    return collection(db, `users/${userId}/library`);
  }

  async saveItem(item: Omit<LibraryItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = `${item.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    
    const fullItem: LibraryItem = {
      ...item,
      id,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = doc(this.getCollectionRef(item.userId), id);
    await setDoc(docRef, {
      ...fullItem,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    });

    return id;
  }

  async getItem(userId: string, itemId: string): Promise<LibraryItem | null> {
    const docRef = doc(this.getCollectionRef(userId), itemId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) return null;
    
    const data = docSnap.data();
    return {
      ...data,
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt.toDate(),
    } as LibraryItem;
  }

  async getItemsByBook(userId: string, bookId: string, type?: LibraryItem['type']): Promise<LibraryItem[]> {
    let q = query(
      this.getCollectionRef(userId),
      where('bookId', '==', bookId),
      orderBy('createdAt', 'desc')
    );

    if (type) {
      q = query(q, where('type', '==', type));
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        createdAt: data.createdAt.toDate(),
        updatedAt: data.updatedAt.toDate(),
      } as LibraryItem;
    });
  }

  async getItemsByType(userId: string, type: LibraryItem['type'], limitCount = 50): Promise<LibraryItem[]> {
    const q = query(
      this.getCollectionRef(userId),
      where('type', '==', type),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        createdAt: data.createdAt.toDate(),
        updatedAt: data.updatedAt.toDate(),
      } as LibraryItem;
    });
  }

  async updateItem(userId: string, itemId: string, updates: Partial<LibraryItem>): Promise<void> {
    const docRef = doc(this.getCollectionRef(userId), itemId);
    await setDoc(docRef, {
      ...updates,
      updatedAt: Timestamp.fromDate(new Date()),
    }, { merge: true });
  }

  async deleteItem(userId: string, itemId: string): Promise<void> {
    const docRef = doc(this.getCollectionRef(userId), itemId);
    await deleteDoc(docRef);
  }

  async searchItems(userId: string, searchTerm: string, type?: LibraryItem['type']): Promise<LibraryItem[]> {
    // Note: Firestore doesn't support full-text search natively
    // This is a basic implementation - for production, consider using Algolia or similar
    let q = query(
      this.getCollectionRef(userId),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    if (type) {
      q = query(q, where('type', '==', type));
    }

    const querySnapshot = await getDocs(q);
    const items = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        createdAt: data.createdAt.toDate(),
        updatedAt: data.updatedAt.toDate(),
      } as LibraryItem;
    });

    // Client-side filtering for search
    const searchLower = searchTerm.toLowerCase();
    return items.filter(item => 
      item.title.toLowerCase().includes(searchLower) ||
      item.content.toLowerCase().includes(searchLower) ||
      item.tags.some(tag => tag.toLowerCase().includes(searchLower))
    );
  }

  // Specialized methods for top student notes
  async generateTopStudentNote(
    userId: string, 
    bookId: string, 
    content: string, 
    pageNumber: number,
    subject: string
  ): Promise<string> {
    // This would integrate with AI to generate enhanced study notes
    const keyPoints = this.extractKeyPoints(content);
    const mnemonics = await this.generateMnemonics(content);
    const studyTips = this.generateStudyTips(content, subject);
    
    const topStudentNote: Omit<TopStudentNote, 'id' | 'createdAt' | 'updatedAt'> = {
      userId,
      bookId,
      type: 'top-student-note',
      title: `Top Student Notes - Page ${pageNumber}`,
      content,
      pageNumber,
      tags: [subject, 'top-student', 'study-guide'],
      metadata: {
        difficulty: this.assessDifficulty(content),
        subject,
        keyPoints,
        mnemonics,
        visualAids: this.suggestVisualAids(content),
        studyTips,
        commonMistakes: this.identifyCommonMistakes(content, subject),
        examTips: this.generateExamTips(content, subject),
        relatedConcepts: this.findRelatedConcepts(content),
        confidenceScore: 8, // Default high confidence for generated notes
      },
    };

    return await this.saveItem(topStudentNote);
  }

  private extractKeyPoints(content: string): string[] {
    // Simple extraction - in production, use NLP
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    return sentences.slice(0, 5).map(s => s.trim());
  }

  private async generateMnemonics(content: string): Promise<string[]> {
    // This would call an AI service to generate mnemonics
    // For now, return placeholder
    return ["Remember: First letter of each key concept"];
  }

  private generateStudyTips(content: string, subject: string): string[] {
    const tips = [
      "Review this concept multiple times with spaced repetition",
      "Create visual diagrams to understand relationships",
      "Practice with real-world examples",
    ];

    if (subject.toLowerCase().includes('math')) {
      tips.push("Work through practice problems step by step");
    } else if (subject.toLowerCase().includes('science')) {
      tips.push("Connect to laboratory experiments or observations");
    }

    return tips;
  }

  private assessDifficulty(content: string): 'easy' | 'medium' | 'hard' {
    const complexWords = content.split(' ').filter(word => word.length > 8).length;
    const totalWords = content.split(' ').length;
    const complexity = complexWords / totalWords;

    if (complexity > 0.3) return 'hard';
    if (complexity > 0.15) return 'medium';
    return 'easy';
  }

  private suggestVisualAids(content: string): string[] {
    const suggestions = [];
    
    if (content.includes('process') || content.includes('step')) {
      suggestions.push("Flowchart showing the process steps");
    }
    if (content.includes('compare') || content.includes('versus')) {
      suggestions.push("Comparison table or Venn diagram");
    }
    if (content.includes('structure') || content.includes('component')) {
      suggestions.push("Labeled diagram of the structure");
    }
    
    return suggestions;
  }

  private identifyCommonMistakes(content: string, subject: string): string[] {
    // This would be enhanced with subject-specific knowledge
    return [
      "Don't confuse similar-sounding terms",
      "Pay attention to the specific context",
      "Review prerequisites before studying this topic",
    ];
  }

  private generateExamTips(content: string, subject: string): string[] {
    return [
      "This topic frequently appears in exams",
      "Focus on understanding rather than memorization",
      "Practice explaining the concept in your own words",
    ];
  }

  private findRelatedConcepts(content: string): string[] {
    // Simple keyword extraction - would be enhanced with NLP
    const words = content.toLowerCase().split(/\W+/);
    const importantWords = words.filter(word => 
      word.length > 5 && 
      !['the', 'and', 'that', 'this', 'with', 'from', 'they', 'have', 'been'].includes(word)
    );
    
    return [...new Set(importantWords)].slice(0, 5);
  }
}

export const libraryService = new LibraryService();
