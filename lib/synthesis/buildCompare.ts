export function buildCompare(compareCandidates: string[]) {
  if ((compareCandidates || []).length < 2) {
    return ['This page is mainly explanatory rather than contrastive.'];
  }
  return compareCandidates.slice(0, 6);
}
