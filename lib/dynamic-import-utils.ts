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

/**
 * Type-safe wrapper for Next.js dynamic imports that handles non-default exports
 * 
 * @param importFn Function that returns a dynamic import with named export
 * @param exportName Name of the export to use
 * @param options Options for the dynamic import
 * @returns Dynamically imported component
 */
export function safeDynamicNamed<P>(
  importFn: () => Promise<any>,
  exportName: string,
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
    () => importFn().then(mod => ({ default: mod[exportName] })),
    {
      loading: loading || (() => <Loader label={loadingText} />),
      ssr
    }
  );
}

/**
 * Helper to create a dynamic import function that ensures the module is only loaded on the client
 * 
 * @param path Path to the module to import
 * @returns A function that returns a dynamic import
 */
export function createClientImport<T = any>(path: string) {
  return () => {
    if (typeof window === 'undefined') {
      return Promise.resolve({ default: {} } as { default: T });
    }
    return import(path) as Promise<{ default: T }>;
  };
}

export default safeDynamic;