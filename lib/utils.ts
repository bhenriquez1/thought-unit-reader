// lib/dynamic-import-utils.ts

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import Loader from '@/components/ui/loader';

/**
 * Type-safe wrapper for Next.js dynamic imports
 * 
 * @param importFn Function that returns a dynamic import
 * @param options Options for the dynamic import
 * @returns Dynamically imported component
 */
export function safeDynamic<P>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  options: {
    loading?: ComponentType;
    ssr?: boolean;
    loadingText?: string;
  } = {}
) {
  const {
    loading,
    ssr = false,
    loadingText = 'Loading...'
  } = options;

  return dynamic<P>(
    importFn,
    {
      loading: loading || (() => <Loader label={loadingText} />),
      ssr
    }
  );
}