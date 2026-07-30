// lib/page-intelligence/pageBridgeRegistry.ts
// Stores per-page StructuredPageBridge objects produced by buildStructuredPageTextFull().
// Cleared at the start of each document extraction to prevent stale cross-document entries.

import type { StructuredPageBridge } from "../pdf/structuredPageText";

const bridgeRegistry = new Map<number, StructuredPageBridge>();

export const PageBridgeRegistry = {
  set(pageIndex: number, bridge: StructuredPageBridge): void {
    bridgeRegistry.set(pageIndex, bridge);
  },

  get(pageIndex: number): StructuredPageBridge | undefined {
    return bridgeRegistry.get(pageIndex);
  },

  clear(): void {
    bridgeRegistry.clear();
  },
};
