/**
 * Firestore service for PDRM entries and Smart-Hour sessions
 */

import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp,
  onSnapshot,
  type Unsubscribe
} from 'firebase/firestore';
import { getDbInstance } from './firebase';
import type { PDRMEntry } from './pdrmEngine';
import type { SmartHourSession } from '../components/SmartHourWidget';

export interface FirestorePDRMEntry extends Omit<PDRMEntry, 'createdAt' | 'updatedAt'> {
  createdAt: any; // Firestore timestamp
  updatedAt: any; // Firestore timestamp
}

export interface FirestoreSmartHourSession extends Omit<SmartHourSession, 'startTime' | 'endTime'> {
  startTime: any; // Firestore timestamp
  endTime?: any; // Firestore timestamp
}

// Helper to get db instance and throw if not available
function getDb() {
  const db = getDbInstance();
  if (!db) throw new Error('Firebase DB not initialized');
  return db;
}

class PDRMFirestoreService {
  
  /**
   * Save PDRM entry to Firestore
   */
  async savePDRMEntry(entry: PDRMEntry): Promise<void> {
    try {
      const db = getDb();
      const firestoreEntry: FirestorePDRMEntry = {
        ...entry,
        createdAt: entry.createdAt ? new Date(entry.createdAt) : serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'pdrmEntries', entry.id), firestoreEntry);
      console.log('✅ PDRM entry saved to Firestore:', entry.id);
    } catch (error) {
      console.error('Failed to save PDRM entry to Firestore:', error);
      throw error;
    }
  }

  /**
   * Get PDRM entries for a user and book
   */
  async getPDRMEntries(userId: string, bookId?: string): Promise<PDRMEntry[]> {
    try {
      const db = getDb();
      let q = query(
        collection(db, 'pdrmEntries'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(100)
      );

      if (bookId) {
        q = query(
          collection(db, 'pdrmEntries'),
          where('userId', '==', userId),
          where('bookId', '==', bookId),
          orderBy('createdAt', 'desc'),
          limit(100)
        );
      }

      const snapshot = await getDocs(q);
      const entries: PDRMEntry[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data() as FirestorePDRMEntry;
        entries.push({
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString()
        });
      });

      return entries;
    } catch (error) {
      console.error('Failed to get PDRM entries from Firestore:', error);
      throw error;
    }
  }

  /**
   * Update PDRM entry in Firestore
   */
  async updatePDRMEntry(entryId: string, updates: Partial<PDRMEntry>): Promise<void> {
    try {
      const db = getDb();
      const updateData = {
        ...updates,
        updatedAt: serverTimestamp(),
        manuallyEdited: true
      };

      await updateDoc(doc(db, 'pdrmEntries', entryId), updateData);
      console.log('✅ PDRM entry updated in Firestore:', entryId);
    } catch (error) {
      console.error('Failed to update PDRM entry in Firestore:', error);
      throw error;
    }
  }

  /**
   * Delete PDRM entry from Firestore
   */
  async deletePDRMEntry(entryId: string): Promise<void> {
    try {
      const db = getDb();
      await deleteDoc(doc(db, 'pdrmEntries', entryId));
      console.log('✅ PDRM entry deleted from Firestore:', entryId);
    } catch (error) {
      console.error('Failed to delete PDRM entry from Firestore:', error);
      throw error;
    }
  }

  /**
   * Save Smart-Hour session to Firestore
   */
  async saveSmartHourSession(session: SmartHourSession): Promise<void> {
    try {
      const db = getDb();
      const firestoreSession: FirestoreSmartHourSession = {
        ...session,
        startTime: new Date(session.startTime),
        endTime: session.endTime ? new Date(session.endTime) : undefined
      };

      await setDoc(doc(db, 'smartHourSessions', session.id), firestoreSession);
      console.log('✅ Smart-Hour session saved to Firestore:', session.id);
    } catch (error) {
      console.error('Failed to save Smart-Hour session to Firestore:', error);
      throw error;
    }
  }

  /**
   * Get Smart-Hour sessions for a user
   */
  async getSmartHourSessions(userId: string, limitCount: number = 50): Promise<SmartHourSession[]> {
    try {
      const db = getDb();
      const q = query(
        collection(db, 'smartHourSessions'),
        where('userId', '==', userId),
        orderBy('startTime', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(q);
      const sessions: SmartHourSession[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data() as FirestoreSmartHourSession;
        sessions.push({
          ...data,
          id: doc.id,
          startTime: data.startTime?.toDate?.()?.toISOString() || new Date().toISOString(),
          endTime: data.endTime?.toDate?.()?.toISOString()
        });
      });

      return sessions;
    } catch (error) {
      console.error('Failed to get Smart-Hour sessions from Firestore:', error);
      throw error;
    }
  }

  /**
   * Get Smart-Hour session analytics for a user
   */
  async getSmartHourAnalytics(userId: string, days: number = 30): Promise<{
    totalSessions: number;
    totalFocusTime: number;
    averageClarityRating: number;
    streakDays: number;
    sessionsThisWeek: number;
    topPatterns: { pattern: string; count: number }[];
  }> {
    try {
      const db = getDb();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      // Get sessions
      const sessionsQuery = query(
        collection(db, 'smartHourSessions'),
        where('userId', '==', userId),
        where('startTime', '>=', cutoffDate),
        orderBy('startTime', 'desc')
      );

      const sessionsSnapshot = await getDocs(sessionsQuery);
      const sessions: SmartHourSession[] = [];

      sessionsSnapshot.forEach((doc) => {
        const data = doc.data() as FirestoreSmartHourSession;
        sessions.push({
          ...data,
          id: doc.id,
          startTime: data.startTime?.toDate?.()?.toISOString() || new Date().toISOString(),
          endTime: data.endTime?.toDate?.()?.toISOString()
        });
      });

      // Calculate analytics
      const totalSessions = sessions.length;
      const focusSessions = sessions.filter(s => s.sessionType === 'focus');
      const totalFocusTime = focusSessions.reduce((acc, s) => acc + (s.totalMinutes || 0), 0);
      
      const clarityRatings = focusSessions
        .filter(s => s.clarityRating && s.clarityRating > 0)
        .map(s => s.clarityRating!);
      const averageClarityRating = clarityRatings.length > 0 
        ? clarityRatings.reduce((acc, r) => acc + r, 0) / clarityRatings.length 
        : 0;

      // Calculate streak (consecutive days with at least one focus session)
      const sessionDates = [...new Set(focusSessions.map(s => 
        new Date(s.startTime).toDateString()
      ))].sort();
      
      let streakDays = 0;
      const today = new Date().toDateString();
      let currentDate = new Date();
      
      while (sessionDates.includes(currentDate.toDateString())) {
        streakDays++;
        currentDate.setDate(currentDate.getDate() - 1);
      }

      // Sessions this week
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const sessionsThisWeek = sessions.filter(s => 
        new Date(s.startTime) >= weekStart
      ).length;

      // Get PDRM entries to find top patterns
      const pdrmEntries = await this.getPDRMEntries(userId);
      const patternCounts = new Map<string, number>();
      
      pdrmEntries.forEach(entry => {
        const pattern = entry.pattern.name;
        patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
      });

      const topPatterns = Array.from(patternCounts.entries())
        .map(([pattern, count]) => ({ pattern, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        totalSessions,
        totalFocusTime,
        averageClarityRating,
        streakDays,
        sessionsThisWeek,
        topPatterns
      };
    } catch (error) {
      console.error('Failed to get Smart-Hour analytics from Firestore:', error);
      throw error;
    }
  }

  /**
   * Subscribe to real-time PDRM entries updates
   */
  subscribeToUserPDRMEntries(
    userId: string, 
    bookId: string | null,
    callback: (entries: PDRMEntry[]) => void
  ): Unsubscribe {
    try {
      let q = query(
        collection(db, 'pdrmEntries'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(100)
      );

      if (bookId) {
        q = query(
          collection(db, 'pdrmEntries'),
          where('userId', '==', userId),
          where('bookId', '==', bookId),
          orderBy('createdAt', 'desc'),
          limit(100)
        );
      }

      return onSnapshot(q, (snapshot) => {
        const entries: PDRMEntry[] = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data() as FirestorePDRMEntry;
          entries.push({
            ...data,
            id: doc.id,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString()
          });
        });

        callback(entries);
      });
    } catch (error) {
      console.error('Failed to subscribe to PDRM entries:', error);
      return () => {}; // Return empty unsubscribe function
    }
  }

  /**
   * Subscribe to real-time Smart-Hour sessions updates
   */
  subscribeToUserSmartHourSessions(
    userId: string,
    callback: (sessions: SmartHourSession[]) => void
  ): Unsubscribe {
    try {
      const q = query(
        collection(db, 'smartHourSessions'),
        where('userId', '==', userId),
        orderBy('startTime', 'desc'),
        limit(50)
      );

      return onSnapshot(q, (snapshot) => {
        const sessions: SmartHourSession[] = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data() as FirestoreSmartHourSession;
          sessions.push({
            ...data,
            id: doc.id,
            startTime: data.startTime?.toDate?.()?.toISOString() || new Date().toISOString(),
            endTime: data.endTime?.toDate?.()?.toISOString()
          });
        });

        callback(sessions);
      });
    } catch (error) {
      console.error('Failed to subscribe to Smart-Hour sessions:', error);
      return () => {}; // Return empty unsubscribe function
    }
  }

  /**
   * Sync local data to Firestore (for offline-first approach)
   */
  async syncLocalDataToFirestore(userId: string): Promise<void> {
    try {
      // Sync PDRM entries
      const localPDRMData = localStorage.getItem(`pdrm-entries-${userId}`);
      if (localPDRMData) {
        const localEntries: PDRMEntry[] = JSON.parse(localPDRMData);
        
        for (const entry of localEntries) {
          try {
            // Check if entry exists in Firestore
            const docRef = doc(db, 'pdrmEntries', entry.id);
            const docSnap = await getDoc(docRef);
            
            if (!docSnap.exists()) {
              await this.savePDRMEntry(entry);
            }
          } catch (error) {
            console.warn('Failed to sync PDRM entry:', entry.id, error);
          }
        }
      }

      // Sync Smart-Hour sessions
      const localSessionData = localStorage.getItem('smartHour-sessions');
      if (localSessionData) {
        const localSessions: SmartHourSession[] = JSON.parse(localSessionData);
        const userSessions = localSessions.filter(s => s.userId === userId);
        
        for (const session of userSessions) {
          try {
            // Check if session exists in Firestore
            const docRef = doc(db, 'smartHourSessions', session.id);
            const docSnap = await getDoc(docRef);
            
            if (!docSnap.exists()) {
              await this.saveSmartHourSession(session);
            }
          } catch (error) {
            console.warn('Failed to sync Smart-Hour session:', session.id, error);
          }
        }
      }

      console.log('✅ Local data synced to Firestore');
    } catch (error) {
      console.error('Failed to sync local data to Firestore:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const pdrmFirestore = new PDRMFirestoreService();
export default pdrmFirestore;
