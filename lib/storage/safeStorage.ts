// lib/storage/safeStorage.ts
// Quota-safe localStorage wrappers.
//
// Every setItem that is not already inside a caller-managed try/catch should go
// through safeSetItem so that a full-quota condition returns false instead of
// throwing synchronously and aborting the calling workflow.

export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn(`[storage] setItem "${key}" failed (quota exceeded?):`, e);
    return false;
  }
}

export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // removeItem never throws quota errors — but guard it anyway for robustness
  }
}

/** Estimate how much quota is already used (bytes). Returns null if unavailable. */
export function estimateUsageBytes(): number | null {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) total += k.length + (localStorage.getItem(k)?.length ?? 0);
    }
    return total * 2; // UTF-16 → approximate bytes
  } catch {
    return null;
  }
}
