// lib/dynamic-import-utils.ts

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

// The simplest possible version without any custom loading component
export function safeDynamic<P>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  options: {
    ssr?: boolean;
  } = {}
) {
  const { ssr = false } = options;
  
  // Just use dynamic directly without any custom loading component
  return dynamic<P>(importFn, { ssr });
}

// For named exports
export function safeDynamicNamed<P>(
  importFn: () => Promise<any>,
  exportName: string,
  options: {
    ssr?: boolean;
  } = {}
) {
  const { ssr = false } = options;
  
  return dynamic<P>(
    () => importFn().then(mod => ({ default: mod[exportName] })),
    { ssr }
  );
}

export default safeDynamic;