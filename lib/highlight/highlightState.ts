let activeAnchorId: string | null = null;

export function setActiveAnchor(anchorId: string) {
  activeAnchorId = anchorId;
}

export function clearActiveAnchor() {
  activeAnchorId = null;
}

export function getActiveAnchor() {
  return activeAnchorId;
}
