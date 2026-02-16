// lib/storage/storageRecovery.ts
// Recovery utilities to fix localStorage quota issues on app startup

import { clearOversizedStorage } from './safePersist';
import { pruneOldCaches } from './indexedDB';

// Store names that we manage
const MANAGED_STORES = [
  'expert-view-store',
  'cognitive-engine-store',
  'relationship-store',
  'surgeon-engine-store',
  'course-intelligence-store',
];

/**
 * Run recovery on app startup to fix any storage issues
 * Call this early in app initialization
 */
export async function runStorageRecovery(): Promise<{
  recoveredLocalStorage: boolean;
  prunedIndexedDB: number;
}> {
  let recoveredLocalStorage = false;
  let prunedIndexedDB = 0;

  // Check if localStorage is accessible
  if (typeof window === 'undefined' || !window.localStorage) {
    return { recoveredLocalStorage, prunedIndexedDB };
  }

  try {
    // 1. Clear any oversized entries (> 200KB)
    const sizeBefore = getTotalLocalStorageSize();
    clearOversizedStorage(200 * 1024);
    const sizeAfter = getTotalLocalStorageSize();
    recoveredLocalStorage = sizeAfter < sizeBefore;

    if (recoveredLocalStorage) {
      console.log(
        `[StorageRecovery] Recovered ${Math.round((sizeBefore - sizeAfter) / 1024)}KB from localStorage`
      );
    }

    // 2. Check if localStorage is near capacity and prune if needed
    const usagePercent = estimateLocalStorageUsage();
    if (usagePercent > 80) {
      console.log(`[StorageRecovery] localStorage at ${usagePercent}% capacity, pruning...`);

      // Remove older managed stores data
      for (const storeName of MANAGED_STORES) {
        try {
          const value = localStorage.getItem(storeName);
          if (value && value.length > 50 * 1024) {
            localStorage.removeItem(storeName);
            console.log(`[StorageRecovery] Cleared oversized store: ${storeName}`);
          }
        } catch {
          // Best effort
        }
      }
    }

    // 3. Prune old IndexedDB caches (older than 7 days)
    prunedIndexedDB = await pruneOldCaches(7);
  } catch (error) {
    console.warn('[StorageRecovery] Recovery failed:', error);
  }

  return { recoveredLocalStorage, prunedIndexedDB };
}

/**
 * Get total size of all localStorage entries in bytes
 */
function getTotalLocalStorageSize(): number {
  if (typeof window === 'undefined' || !window.localStorage) {
    return 0;
  }

  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key);
      if (value) {
        // Each character is 2 bytes in JavaScript strings (UTF-16)
        total += key.length * 2 + value.length * 2;
      }
    }
  }
  return total;
}

/**
 * Estimate localStorage usage as percentage of quota
 * Most browsers have 5-10MB limit
 */
function estimateLocalStorageUsage(): number {
  const totalSize = getTotalLocalStorageSize();
  const assumedQuota = 5 * 1024 * 1024; // Assume 5MB quota
  return Math.round((totalSize / assumedQuota) * 100);
}

/**
 * Check if a specific store is corrupted or oversized
 */
export function isStoreHealthy(storeName: string): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return true; // SSR - assume healthy
  }

  try {
    const value = localStorage.getItem(storeName);
    if (!value) return true; // Empty is fine

    // Check size
    if (value.length > 200 * 1024) {
      return false;
    }

    // Check if valid JSON
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reset a specific store to recover from corruption
 */
export function resetStore(storeName: string): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    localStorage.removeItem(storeName);
    console.log(`[StorageRecovery] Reset store: ${storeName}`);
  } catch {
    // Best effort
  }
}
