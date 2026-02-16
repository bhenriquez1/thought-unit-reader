// lib/storage/safePersist.ts
// Safe localStorage persistence middleware for Zustand
// Handles quota exceeded errors gracefully and provides size guards

import { StateStorage } from 'zustand/middleware';
import { pruneOldCaches } from './indexedDB';

// Maximum size for localStorage writes (200KB to be safe)
const MAX_LOCALSTORAGE_SIZE = 200 * 1024;

// Warn threshold (100KB)
const WARN_SIZE_THRESHOLD = 100 * 1024;

// ============================================================================
// Size Checking
// ============================================================================

export function getStateSize(state: unknown): number {
  try {
    return JSON.stringify(state).length;
  } catch {
    return Infinity; // If we can't stringify, treat as too large
  }
}

export function isStateTooLarge(state: unknown): boolean {
  return getStateSize(state) > MAX_LOCALSTORAGE_SIZE;
}

// ============================================================================
// Safe localStorage Storage
// ============================================================================

export interface SafeStorageOptions {
  /**
   * Maximum size in bytes for localStorage writes
   * @default 200 * 1024 (200KB)
   */
  maxSize?: number;
  /**
   * Callback when storage quota is exceeded
   */
  onQuotaExceeded?: (error: Error, key: string) => void;
  /**
   * Callback when state is too large
   */
  onStateTooLarge?: (size: number, key: string) => void;
  /**
   * Function to extract minimal state when full state is too large
   */
  getMinimalState?: (state: unknown) => unknown;
  /**
   * Whether to auto-prune IndexedDB caches on quota error
   * @default true
   */
  autoPrune?: boolean;
}

/**
 * Creates a safe localStorage storage adapter for Zustand persist middleware
 * - Catches and handles quota exceeded errors
 * - Provides size guards to prevent large writes
 * - Falls back to minimal state when needed
 */
export function createSafeStorage(options: SafeStorageOptions = {}): StateStorage {
  const {
    maxSize = MAX_LOCALSTORAGE_SIZE,
    onQuotaExceeded,
    onStateTooLarge,
    getMinimalState,
    autoPrune = true,
  } = options;

  // Track if we've already shown warnings this session
  let hasWarnedSize = false;
  let hasWarnedQuota = false;

  return {
    getItem: (name: string): string | null => {
      if (typeof window === 'undefined') return null;

      try {
        return localStorage.getItem(name);
      } catch (error) {
        console.warn(`[SafeStorage] Failed to read ${name}:`, error);
        return null;
      }
    },

    setItem: (name: string, value: string): void => {
      if (typeof window === 'undefined') return;

      const size = value.length;

      // Size check
      if (size > maxSize) {
        if (!hasWarnedSize) {
          console.warn(
            `[SafeStorage] State too large for ${name}: ${Math.round(size / 1024)}KB > ${Math.round(maxSize / 1024)}KB`
          );
          hasWarnedSize = true;
        }
        onStateTooLarge?.(size, name);

        // Try to extract minimal state if available
        if (getMinimalState) {
          try {
            const parsed = JSON.parse(value);
            const minimalState = getMinimalState(parsed.state);
            const minimalValue = JSON.stringify({ ...parsed, state: minimalState });

            if (minimalValue.length <= maxSize) {
              localStorage.setItem(name, minimalValue);
              console.log(`[SafeStorage] Saved minimal state for ${name}`);
              return;
            }
          } catch {
            // Fall through to skip write
          }
        }

        // Skip write entirely
        console.warn(`[SafeStorage] Skipping localStorage write for ${name}`);
        return;
      }

      // Size warning
      if (size > WARN_SIZE_THRESHOLD && !hasWarnedSize) {
        console.warn(
          `[SafeStorage] State approaching limit for ${name}: ${Math.round(size / 1024)}KB`
        );
      }

      // Attempt write
      try {
        localStorage.setItem(name, value);
      } catch (error) {
        const isQuotaError =
          error instanceof Error &&
          (error.name === 'QuotaExceededError' ||
            error.message.includes('quota') ||
            error.message.includes('QuotaExceeded'));

        if (isQuotaError) {
          if (!hasWarnedQuota) {
            console.warn(`[SafeStorage] Quota exceeded for ${name}`);
            hasWarnedQuota = true;
          }
          onQuotaExceeded?.(error as Error, name);

          // Auto-prune old caches
          if (autoPrune) {
            pruneOldCaches(7).catch(() => {});
          }

          // Try to clear this specific key and retry with minimal state
          try {
            localStorage.removeItem(name);

            if (getMinimalState) {
              const parsed = JSON.parse(value);
              const minimalState = getMinimalState(parsed.state);
              const minimalValue = JSON.stringify({ ...parsed, state: minimalState });
              localStorage.setItem(name, minimalValue);
              console.log(`[SafeStorage] Recovered with minimal state for ${name}`);
              return;
            }
          } catch {
            // Give up gracefully
          }
        } else {
          console.error(`[SafeStorage] Unexpected error writing ${name}:`, error);
        }
      }
    },

    removeItem: (name: string): void => {
      if (typeof window === 'undefined') return;

      try {
        localStorage.removeItem(name);
      } catch (error) {
        console.warn(`[SafeStorage] Failed to remove ${name}:`, error);
      }
    },
  };
}

// ============================================================================
// Pre-configured Storage for Common Use Cases
// ============================================================================

/**
 * Default safe storage - 200KB limit with auto-prune
 */
export const safeLocalStorage = createSafeStorage();

/**
 * Strict safe storage - 50KB limit for UI-only state
 */
export const strictLocalStorage = createSafeStorage({
  maxSize: 50 * 1024,
});

// ============================================================================
// Helper for Partialize Functions
// ============================================================================

/**
 * Creates a partialize function that ensures only minimal state is persisted
 */
export function createMinimalPartialize<T extends object, K extends keyof T>(
  keys: K[]
): (state: T) => Pick<T, K> {
  return (state: T) => {
    const partial = {} as Pick<T, K>;
    for (const key of keys) {
      partial[key] = state[key];
    }
    return partial;
  };
}

// ============================================================================
// Migration Helper
// ============================================================================

/**
 * Clears oversized localStorage entries
 * Call this on app startup to recover from quota errors
 */
export function clearOversizedStorage(maxSizePerKey: number = MAX_LOCALSTORAGE_SIZE): void {
  if (typeof window === 'undefined') return;

  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    try {
      const value = localStorage.getItem(key);
      if (value && value.length > maxSizePerKey) {
        keysToRemove.push(key);
      }
    } catch {
      // If we can't even read it, mark for removal
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    try {
      localStorage.removeItem(key);
      console.log(`[SafeStorage] Removed oversized key: ${key}`);
    } catch {
      // Best effort
    }
  }

  if (keysToRemove.length > 0) {
    console.log(`[SafeStorage] Cleared ${keysToRemove.length} oversized localStorage entries`);
  }
}
