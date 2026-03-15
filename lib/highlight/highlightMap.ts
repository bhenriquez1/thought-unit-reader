export type HighlightRegion = { anchorId: string; x: number; y: number; width: number; height: number };

export function buildHighlightMap(anchors: Array<{ id: string; rect?: { x: number; y: number; width: number; height: number } }>): HighlightRegion[] {
  return anchors
    .filter((a) => a.rect)
    .map((a) => ({ anchorId: a.id, ...(a.rect as { x: number; y: number; width: number; height: number }) }));
}

export function getHighlightRegionForAnchor(map: HighlightRegion[], anchorId: string): HighlightRegion | undefined {
  return map.find((entry) => entry.anchorId === anchorId);
}
