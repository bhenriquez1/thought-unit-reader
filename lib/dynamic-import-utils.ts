// lib/dynamic-import-utils.ts

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
// Import React to use createElement
import * as React from 'react';
// Import the loader component
import Loader from '@/components/ui/loader';

/**
 * Type-safe wrapper for Next.js dynamic imports
 */
export function safeDynamic<P>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  options: {
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

  // Use React.createElement instead of JSX
  return dynamic<P>(
    importFn,
    {
      loading: loading || (() => React.createElement(Loader, { label: loadingText })),
      ssr
    }
  );
}