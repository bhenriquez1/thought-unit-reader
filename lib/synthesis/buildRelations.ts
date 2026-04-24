export function buildRelations(relations: string[]) {
  if (!relations.length) {
    return ['No strong same-page conceptual chain detected yet.'];
  }
  return relations.slice(0, 8);
}
