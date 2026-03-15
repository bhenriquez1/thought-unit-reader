export function buildCompare(compareCandidates: string[]) {
  if ((compareCandidates || []).length < 2) {
    return ['No compare pair available for the current page cluster yet.'];
  }
  return compareCandidates;
}
