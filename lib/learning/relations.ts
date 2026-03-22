import type { ConnectionEdge, ConnectionNode, LearningCard } from './model';

export function buildConnectionGraph(cards: LearningCard[]): { nodes: ConnectionNode[]; edges: ConnectionEdge[] } {
  const nodes: ConnectionNode[] = cards.map((card) => ({
    id: card.id,
    label: card.title,
    type: card.type === 'formula' ? 'formula' : card.type === 'comparison' ? 'comparison' : 'core',
    page: card.page,
  }));

  const edges: ConnectionEdge[] = [];
  for (const card of cards) {
    for (const relation of card.relations) {
      const relationType = relation.relation;
      if (
        relationType === 'depends_on' ||
        relationType === 'defines' ||
        relationType === 'causes' ||
        relationType === 'implies' ||
        relationType === 'contrasts_with' ||
        relationType === 'example_of' ||
        relationType === 'applies_to'
      ) {
        edges.push({
          id: `${card.id}_${relation.targetId}_${relationType}`,
          source: card.id,
          target: relation.targetId,
          relation: relationType,
        });
      }
    }
  }

  return { nodes, edges };
}
