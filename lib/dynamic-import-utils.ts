// lib/dynamic-import-utils.ts

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import * as React from 'react'; // Import React explicitly

// Create a simple LoadingComponent separately to avoid JSX in the dynamic options
const LoadingComponent = ({ loadingText = 'Loading...' }: { loadingText?: string }) => {
  // Import Loader dynamically to avoid the circular reference
  const LoaderComponent = require('@/components/ui/loader').default;
  return React.createElement(LoaderComponent, { label: loadingText });
};

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

  // Create a separate loading component factory function
  const defaultLoading = () => React.createElement(LoadingComponent, { loadingText });

  return dynamic<P>(
    importFn,
    {
      loading: loading || defaultLoading,
      ssr
    }
  );
}

export default safeDynamic;