export function buildRelations(relations: string[]) {
  return relations.length ? relations : ['No grounded relations found for this page yet.'];
}
