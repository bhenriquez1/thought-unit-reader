// lib/useUnifiedNavigation.ts
"use client";

import { useCallback } from 'react';
import { useReaderSync, SyncSource } from '@/lib/readerSync';

export interface NavigationOptions {
  /** Whether to trigger chapter animations */
  animate?: boolean;
  /** Additional callback after successful navigation */
  onSuccess?: (page: number, title?: string) => void;
  /** Additional callback on navigation failure */
  onError?: (error: string) => void;
  /** Whether to force navigation even to current page */
  force?: boolean;
}

/**
 * Unified navigation hook that ensures all navigation flows through readerSync
 * This prevents components from becoming desynchronized
 */
export function useUnifiedNavigation() {
  const { 
    page: currentPage,
    unitIndex: currentUnit,
    updateSync,
    syncToChapter,
    pageToUnitSmart,
    unitToPageSmart,
    totalPages
  } = useReaderSync();

  /**
   * Navigate to a specific page with proper sync
   */
  const jumpToPage = useCallback((
    targetPage: number, 
    source: SyncSource = 'manual',
    options: NavigationOptions = {}
  ) => {
    console.log(`🧭 UnifiedNavigation: jumpToPage(${targetPage}) from ${source}`);
    
    try {
      // Validate page number
      if (!targetPage || targetPage < 1) {
        const error = `Invalid page number: ${targetPage}`;
        console.error(`🧭 UnifiedNavigation: ${error}`);
        options.onError?.(error);
        return false;
      }
      
      if (totalPages > 0 && targetPage > totalPages) {
        const error = `Page ${targetPage} exceeds total pages (${totalPages})`;
        console.error(`🧭 UnifiedNavigation: ${error}`);
        options.onError?.(error);
        return false;
      }
      
      // Skip if same page (unless forced)
      if (!options.force && targetPage === currentPage) {
        console.log(`🧭 UnifiedNavigation: Already on page ${targetPage}, skipping`);
        return true;
      }
      
      // Calculate corresponding unit using smart mapping
      const targetUnit = pageToUnitSmart(targetPage);
      
      // Update sync state - this is the single source of truth
      updateSync({
        page: targetPage,
        unitIndex: targetUnit
      }, source);
      
      console.log(`🧭 UnifiedNavigation: Successfully navigated to page ${targetPage}, unit ${targetUnit}`);
      options.onSuccess?.(targetPage);
      return true;
      
    } catch (error) {
      const errorMsg = `Navigation failed: ${error}`;
      console.error(`🧭 UnifiedNavigation: ${errorMsg}`);
      options.onError?.(errorMsg);
      return false;
    }
  }, [currentPage, updateSync, pageToUnitSmart, totalPages]);

  /**
   * Navigate to a chapter by title with fallback to page
   */
  const jumpToChapter = useCallback((
    chapterTitle: string,
    options: NavigationOptions = {}
  ) => {
    console.log(`🧭 UnifiedNavigation: jumpToChapter("${chapterTitle}")`);
    
    try {
      // Use readerSync's chapter navigation
      const success = syncToChapter(chapterTitle);
      
      if (success) {
        console.log(`🧭 UnifiedNavigation: Successfully navigated to chapter "${chapterTitle}"`);
        options.onSuccess?.(currentPage, chapterTitle);
        return true;
      } else {
        const error = `Chapter not found: "${chapterTitle}"`;
        console.warn(`🧭 UnifiedNavigation: ${error}`);
        options.onError?.(error);
        return false;
      }
      
    } catch (error) {
      const errorMsg = `Chapter navigation failed: ${error}`;
      console.error(`🧭 UnifiedNavigation: ${errorMsg}`);
      options.onError?.(errorMsg);
      return false;
    }
  }, [syncToChapter, currentPage]);

  /**
   * Navigate to a unit index with proper sync
   */
  const jumpToUnit = useCallback((
    targetUnit: number,
    source: SyncSource = 'manual',
    options: NavigationOptions = {}
  ) => {
    console.log(`🧭 UnifiedNavigation: jumpToUnit(${targetUnit}) from ${source}`);
    
    try {
      // Validate unit index
      if (!targetUnit || targetUnit < 1) {
        const error = `Invalid unit index: ${targetUnit}`;
        console.error(`🧭 UnifiedNavigation: ${error}`);
        options.onError?.(error);
        return false;
      }
      
      // Skip if same unit (unless forced)
      if (!options.force && targetUnit === currentUnit) {
        console.log(`🧭 UnifiedNavigation: Already on unit ${targetUnit}, skipping`);
        return true;
      }
      
      // Calculate corresponding page using smart mapping
      const targetPage = unitToPageSmart(targetUnit);
      
      // Update sync state
      updateSync({
        page: targetPage,
        unitIndex: targetUnit
      }, source);
      
      console.log(`🧭 UnifiedNavigation: Successfully navigated to unit ${targetUnit}, page ${targetPage}`);
      options.onSuccess?.(targetPage);
      return true;
      
    } catch (error) {
      const errorMsg = `Unit navigation failed: ${error}`;
      console.error(`🧭 UnifiedNavigation: ${errorMsg}`);
      options.onError?.(errorMsg);
      return false;
    }
  }, [currentUnit, updateSync, unitToPageSmart]);

  /**
   * Programmatic batch navigation with multiple updates
   */
  const navigateProgrammatically = useCallback((
    updates: Partial<{
      page: number;
      unitIndex: number;
      activeChunkId: string;
    }>,
    source: SyncSource = 'manual',
    options: NavigationOptions = {}
  ) => {
    console.log(`🧭 UnifiedNavigation: navigateProgrammatically`, updates, `from ${source}`);
    
    try {
      // Validate updates
      if (updates.page && (updates.page < 1 || (totalPages > 0 && updates.page > totalPages))) {
        const error = `Invalid page in batch update: ${updates.page}`;
        console.error(`🧭 UnifiedNavigation: ${error}`);
        options.onError?.(error);
        return false;
      }
      
      // Apply batch update
      updateSync(updates, source);
      
      console.log(`🧭 UnifiedNavigation: Successfully applied programmatic navigation`);
      options.onSuccess?.(updates.page || currentPage);
      return true;
      
    } catch (error) {
      const errorMsg = `Programmatic navigation failed: ${error}`;
      console.error(`🧭 UnifiedNavigation: ${errorMsg}`);
      options.onError?.(errorMsg);
      return false;
    }
  }, [updateSync, currentPage, totalPages]);

  /**
   * Get current navigation state
   */
  const getNavigationState = useCallback(() => {
    return {
      currentPage,
      currentUnit,
      totalPages
    };
  }, [currentPage, currentUnit, totalPages]);

  return {
    // Core navigation methods
    jumpToPage,
    jumpToChapter,
    jumpToUnit,
    navigateProgrammatically,
    
    // State access
    getNavigationState,
    currentPage,
    currentUnit,
    totalPages,
    
    // Convenience methods
    canGoToPage: (page: number) => page >= 1 && (totalPages === 0 || page <= totalPages),
    isCurrentPage: (page: number) => page === currentPage,
    isCurrentUnit: (unit: number) => unit === currentUnit,
  };
}

export default useUnifiedNavigation;
