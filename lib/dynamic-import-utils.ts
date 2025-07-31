// lib/dynamic-import-utils.ts

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
// Import the actual Loader component as a value, not a type
import Loader from '@/components/ui/loader';

/**
 * Type-safe wrapper for Next.js dynamic imports
 */
export function safeDynamic<P>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  options: {
    // Don't use Loader as a type, use React's built-in types
    loading?: ComponentType<any> | null;
    ssr?: boolean;
    loadingText?: string;
  } = {}
) {
  const {
    loading,
    ssr = false,
    loadingText = 'Loading...'
  } = options;

  // Use a JSX element directly here, not a type reference
  return dynamic<P>(
    importFn,
    {
      // Create an anonymous function that returns the JSX
      loading: loading || (() => React.createElement(Loader, { label: loadingText })),
      ssr
    }
  );
}