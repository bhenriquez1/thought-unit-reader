// lib/courseIntelligence/indexedDBStorage.ts
// IndexedDB storage for large Course Intelligence data (syllabi, mappings, etc.)

const DB_NAME = 'CourseIntelligenceDB';
const DB_VERSION = 1;
const STORES = {
  syllabusBlocks: 'syllabusBlocks',
  timeline: 'timeline',
  mappings: 'mappings',
  coverageGraph: 'coverageGraph',
  studyPlan: 'studyPlan',
};

// ============================================================================
// Database Initialization
// ============================================================================

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('📦 IndexedDB: Failed to open database');
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log('📦 IndexedDB: Database opened successfully');
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      console.log('📦 IndexedDB: Upgrading database schema');

      // Create object stores
      Object.values(STORES).forEach(storeName => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'documentId' });
          console.log(`📦 IndexedDB: Created store "${storeName}"`);
        }
      });
    };
  });

  return dbPromise;
}

// ============================================================================
// Generic CRUD Operations
// ============================================================================

async function put<T>(storeName: string, documentId: string, data: T): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put({ documentId, data, updatedAt: Date.now() });

      request.onsuccess = () => {
        console.log(`📦 IndexedDB: Saved to ${storeName} for ${documentId}`);
        resolve();
      };
      request.onerror = () => {
        console.error(`📦 IndexedDB: Failed to save to ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.warn(`📦 IndexedDB: put failed for ${storeName}:`, error);
    // Don't throw - graceful degradation
  }
}

async function get<T>(storeName: string, documentId: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(documentId);

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          console.log(`📦 IndexedDB: Loaded from ${storeName} for ${documentId}`);
          resolve(result.data as T);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => {
        console.error(`📦 IndexedDB: Failed to load from ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.warn(`📦 IndexedDB: get failed for ${storeName}:`, error);
    return null;
  }
}

async function remove(storeName: string, documentId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(documentId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn(`📦 IndexedDB: remove failed for ${storeName}:`, error);
  }
}

// ============================================================================
// Course Intelligence Specific API
// ============================================================================

import type {
  SyllabusBlock,
  TimelineItem,
  ObjectiveMapping,
  CoverageGraph,
  StudyPlan,
} from './types';

export interface StoredSyllabusData {
  blocks: SyllabusBlock[];
  rawText?: string;
  parsedAt: number;
}

export interface StoredMappingsData {
  objectiveMappings: ObjectiveMapping[];
  lowConfidenceMappings: ObjectiveMapping[];
  mappedAt: number;
}

// Syllabus Blocks
export async function saveSyllabusBlocks(
  documentId: string,
  blocks: SyllabusBlock[],
  rawText?: string
): Promise<void> {
  const data: StoredSyllabusData = {
    blocks,
    rawText: rawText?.substring(0, 10000), // Only store first 10KB of raw text
    parsedAt: Date.now(),
  };
  await put(STORES.syllabusBlocks, documentId, data);
}

export async function loadSyllabusBlocks(
  documentId: string
): Promise<StoredSyllabusData | null> {
  return get<StoredSyllabusData>(STORES.syllabusBlocks, documentId);
}

// Timeline
export async function saveTimeline(
  documentId: string,
  timeline: TimelineItem[]
): Promise<void> {
  await put(STORES.timeline, documentId, timeline);
}

export async function loadTimeline(
  documentId: string
): Promise<TimelineItem[] | null> {
  return get<TimelineItem[]>(STORES.timeline, documentId);
}

// Mappings
export async function saveMappings(
  documentId: string,
  objectiveMappings: ObjectiveMapping[],
  lowConfidenceMappings: ObjectiveMapping[]
): Promise<void> {
  const data: StoredMappingsData = {
    objectiveMappings,
    lowConfidenceMappings,
    mappedAt: Date.now(),
  };
  await put(STORES.mappings, documentId, data);
}

export async function loadMappings(
  documentId: string
): Promise<StoredMappingsData | null> {
  return get<StoredMappingsData>(STORES.mappings, documentId);
}

// Coverage Graph
export async function saveCoverageGraph(
  documentId: string,
  graph: CoverageGraph
): Promise<void> {
  await put(STORES.coverageGraph, documentId, graph);
}

export async function loadCoverageGraph(
  documentId: string
): Promise<CoverageGraph | null> {
  return get<CoverageGraph>(STORES.coverageGraph, documentId);
}

// Study Plan
export async function saveStudyPlan(
  documentId: string,
  plan: StudyPlan
): Promise<void> {
  await put(STORES.studyPlan, documentId, plan);
}

export async function loadStudyPlan(
  documentId: string
): Promise<StudyPlan | null> {
  return get<StudyPlan>(STORES.studyPlan, documentId);
}

// Clear all data for a document
export async function clearDocumentData(documentId: string): Promise<void> {
  await Promise.all(
    Object.values(STORES).map(store => remove(store, documentId))
  );
  console.log(`📦 IndexedDB: Cleared all data for ${documentId}`);
}

// Load all data for a document (for hydration)
export async function loadAllDocumentData(documentId: string): Promise<{
  syllabusBlocks: SyllabusBlock[];
  timeline: TimelineItem[];
  objectiveMappings: ObjectiveMapping[];
  lowConfidenceMappings: ObjectiveMapping[];
  coverageGraph: CoverageGraph | null;
  studyPlan: StudyPlan | null;
} | null> {
  try {
    const [syllabusData, timeline, mappingsData, coverageGraph, studyPlan] = await Promise.all([
      loadSyllabusBlocks(documentId),
      loadTimeline(documentId),
      loadMappings(documentId),
      loadCoverageGraph(documentId),
      loadStudyPlan(documentId),
    ]);

    if (!syllabusData && !timeline && !mappingsData) {
      return null; // No data stored
    }

    return {
      syllabusBlocks: syllabusData?.blocks || [],
      timeline: timeline || [],
      objectiveMappings: mappingsData?.objectiveMappings || [],
      lowConfidenceMappings: mappingsData?.lowConfidenceMappings || [],
      coverageGraph,
      studyPlan,
    };
  } catch (error) {
    console.error('📦 IndexedDB: Failed to load document data:', error);
    return null;
  }
}
