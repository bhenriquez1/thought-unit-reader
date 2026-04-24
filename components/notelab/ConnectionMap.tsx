import React from 'react';
import type { ConnectionEdge, ConnectionNode } from '@/lib/learning/model';

export type ConnectionMapProps = {
  nodes: ConnectionNode[];
  edges: ConnectionEdge[];
  activeNodeId?: string | null;
  onSelectNode: (id: string) => void;
  onOpenSource?: (sourcePage: number, paragraphId?: string | null) => void;
};

export default function ConnectionMap({ nodes, edges, activeNodeId, onSelectNode, onOpenSource }: ConnectionMapProps) {
  if (nodes.length === 0 || edges.length === 0) {
    return <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-4 text-sm text-gray-400">No strong relations yet. Add links between cards in Concept Board.</div>;
  }

  return (
    <div className="space-y-3">
      {edges.map((edge) => {
        const source = nodes.find((node) => node.id === edge.source);
        const target = nodes.find((node) => node.id === edge.target);
        if (!source || !target) return null;
        const targetPage = target.page;
        return (
          <div key={edge.id} className="rounded-lg border border-gray-700 bg-gray-800/70 p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button className={`px-2 py-1 rounded text-xs ${activeNodeId === source.id ? 'bg-purple-700 text-white' : 'bg-gray-700 text-gray-200'}`} onClick={() => onSelectNode(source.id)}>{source.label}</button>
              <span className="text-xs text-gray-400">{edge.relation.replace('_', ' → ')}</span>
              <button className={`px-2 py-1 rounded text-xs ${activeNodeId === target.id ? 'bg-purple-700 text-white' : 'bg-gray-700 text-gray-200'}`} onClick={() => onSelectNode(target.id)}>{target.label}</button>
              {typeof targetPage === 'number' && onOpenSource && (
                <button className="ml-auto px-2 py-1 rounded text-xs bg-blue-700 text-white" onClick={() => onOpenSource(targetPage)}>Open p.{targetPage}</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
