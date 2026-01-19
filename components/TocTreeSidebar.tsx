"use client";

// components/TocTreeSidebar.tsx
// Clickable Table of Contents - Single tree with expandable nodes
// Uses tocAnchors for page navigation

import React, { useState, useMemo, useCallback } from 'react';
import type { TocNode, Warning } from '@/lib/tocTypes';

interface TocTreeSidebarProps {
  toc: TocNode[];
  tocAnchors: Record<string, number>;  // tocId -> pageIndex
  warnings: Warning[];
  currentPage: number;
  onJumpToPage: (pageIndex: number) => void;
  isVisible?: boolean;
  onToggleVisibility?: () => void;
}

// Recursive TOC node component
function TocNodeItem({
  node,
  tocAnchors,
  currentPage,
  onJumpToPage,
  depth = 0,
  expandedNodes,
  toggleNode
}: {
  node: TocNode;
  tocAnchors: Record<string, number>;
  currentPage: number;
  onJumpToPage: (pageIndex: number) => void;
  depth?: number;
  expandedNodes: Set<string>;
  toggleNode: (id: string) => void;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const pageIndex = tocAnchors[node.id] ?? node.pageIndex;
  const isCurrentPage = pageIndex === currentPage - 1;
  
  // Confidence indicator color
  const confidenceColor = node.confidence.overall >= 0.8 ? 'text-green-400' :
    node.confidence.overall >= 0.5 ? 'text-yellow-400' : 'text-red-400';
  
  // Indentation based on depth
  const paddingLeft = depth * 16 + 12;
  
  return (
    <div data-testid={`toc-node-${node.id}`}>
      <div
        className={`flex items-center gap-2 py-2 px-3 cursor-pointer transition-colors rounded-lg ${
          isCurrentPage 
            ? 'bg-yellow-500/20 text-yellow-300' 
            : 'hover:bg-gray-700 text-gray-300'
        }`}
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={() => onJumpToPage(pageIndex + 1)}
      >
        {/* Expand/collapse button */}
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleNode(node.id);
            }}
            className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-white"
          >
            {isExpanded ? '▼' : '▶'}
          </button>
        )}
        {!hasChildren && <span className="w-5" />}
        
        {/* Node title */}
        <span className={`flex-1 text-sm truncate ${
          depth === 0 ? 'font-semibold' : 
          depth === 1 ? 'font-medium' : ''
        }`}>
          {node.title}
        </span>
        
        {/* Page number */}
        <span className="text-xs text-gray-500 ml-2">
          {pageIndex + 1}
        </span>
        
        {/* Low confidence indicator */}
        {node.confidence.overall < 0.5 && (
          <span className={`text-xs ${confidenceColor}`} title={`Confidence: ${Math.round(node.confidence.overall * 100)}%`}>
            ⚠
          </span>
        )}
      </div>
      
      {/* Children (expanded) */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TocNodeItem
              key={child.id}
              node={child}
              tocAnchors={tocAnchors}
              currentPage={currentPage}
              onJumpToPage={onJumpToPage}
              depth={depth + 1}
              expandedNodes={expandedNodes}
              toggleNode={toggleNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TocTreeSidebar({
  toc,
  tocAnchors,
  warnings,
  currentPage,
  onJumpToPage,
  isVisible = true,
  onToggleVisibility
}: TocTreeSidebarProps) {
  // Expanded nodes state
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    // Auto-expand first level by default
    const initial = new Set<string>();
    toc.forEach(node => initial.add(node.id));
    return initial;
  });
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Toggle node expansion
  const toggleNode = useCallback((id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  
  // Expand all / collapse all
  const expandAll = useCallback(() => {
    const allIds = new Set<string>();
    const collectIds = (nodes: TocNode[]) => {
      nodes.forEach(node => {
        allIds.add(node.id);
        if (node.children) collectIds(node.children);
      });
    };
    collectIds(toc);
    setExpandedNodes(allIds);
  }, [toc]);
  
  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, []);
  
  // Filter TOC by search
  const filteredToc = useMemo(() => {
    if (!searchQuery.trim()) return toc;
    
    const query = searchQuery.toLowerCase();
    const filterNodes = (nodes: TocNode[]): TocNode[] => {
      return nodes.reduce<TocNode[]>((acc, node) => {
        const matchesTitle = node.title.toLowerCase().includes(query);
        const filteredChildren = node.children ? filterNodes(node.children) : [];
        
        if (matchesTitle || filteredChildren.length > 0) {
          acc.push({
            ...node,
            children: filteredChildren
          });
        }
        return acc;
      }, []);
    };
    
    return filterNodes(toc);
  }, [toc, searchQuery]);
  
  // Warnings summary
  const warningCount = warnings.filter(w => w.severity === 'warning' || w.severity === 'error').length;
  
  if (!isVisible) {
    return (
      <button
        onClick={onToggleVisibility}
        className="fixed left-0 top-1/2 -translate-y-1/2 bg-gray-800 text-white px-2 py-4 rounded-r-lg shadow-lg hover:bg-gray-700 z-50"
        data-testid="toc-show-btn"
      >
        📑
      </button>
    );
  }
  
  return (
    <div className="h-full flex flex-col bg-gray-800 text-white" data-testid="toc-sidebar">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-yellow-400">📑 Table of Contents</h3>
          {onToggleVisibility && (
            <button
              onClick={onToggleVisibility}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>
        
        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search chapters..."
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:border-yellow-500"
          data-testid="toc-search-input"
        />
        
        {/* Expand/Collapse buttons */}
        <div className="flex gap-2 mt-2">
          <button
            onClick={expandAll}
            className="text-xs text-gray-400 hover:text-white"
          >
            Expand All
          </button>
          <span className="text-gray-600">|</span>
          <button
            onClick={collapseAll}
            className="text-xs text-gray-400 hover:text-white"
          >
            Collapse All
          </button>
        </div>
      </div>
      
      {/* Warnings banner */}
      {warningCount > 0 && (
        <div className="px-4 py-2 bg-yellow-900/30 border-b border-yellow-900/50">
          <p className="text-xs text-yellow-400">
            ⚠ {warningCount} warning{warningCount > 1 ? 's' : ''} detected
          </p>
        </div>
      )}
      
      {/* TOC Tree */}
      <div className="flex-1 overflow-auto p-2">
        {filteredToc.length > 0 ? (
          filteredToc.map((node) => (
            <TocNodeItem
              key={node.id}
              node={node}
              tocAnchors={tocAnchors}
              currentPage={currentPage}
              onJumpToPage={onJumpToPage}
              expandedNodes={expandedNodes}
              toggleNode={toggleNode}
            />
          ))
        ) : (
          <div className="text-center py-8 text-gray-500">
            {searchQuery ? (
              <p>No chapters match "{searchQuery}"</p>
            ) : (
              <>
                <p className="text-2xl mb-2">📄</p>
                <p>No table of contents available</p>
                <p className="text-xs mt-2">Upload a PDF with bookmarks or headings</p>
              </>
            )}
          </div>
        )}
      </div>
      
      {/* Footer stats */}
      <div className="p-3 border-t border-gray-700 text-xs text-gray-500">
        <div className="flex justify-between">
          <span>{toc.length} chapters</span>
          <span>Page {currentPage}</span>
        </div>
      </div>
    </div>
  );
}

// Helper to convert legacy TOC format to TocNode[]
export function convertLegacyTocToNodes(
  legacyToc: Array<{ title?: string; text?: string; pageNumber?: number; page?: number; items?: any[]; subChapters?: any[] }>,
  depth: number = 0
): TocNode[] {
  return legacyToc.map((item, idx) => {
    const title = item.title || item.text || `Chapter ${idx + 1}`;
    const pageIndex = (item.pageNumber || item.page || 1) - 1;
    const children = item.items || item.subChapters || [];
    
    // Generate deterministic ID
    const id = `toc_${depth}_${idx}_${title.replace(/\s+/g, '_').substring(0, 20)}`;
    
    return {
      id,
      title,
      pageIndex,
      level: depth,
      confidence: {
        overall: 0.8,
        titleMatch: 0.8,
        hierarchyValid: 0.8,
        pageReliable: 0.8
      },
      children: children.length > 0 ? convertLegacyTocToNodes(children, depth + 1) : []
    };
  });
}

// Helper to build tocAnchors mapping from TocNode[]
export function buildTocAnchors(toc: TocNode[]): Record<string, number> {
  const anchors: Record<string, number> = {};
  
  const processNodes = (nodes: TocNode[]) => {
    nodes.forEach(node => {
      anchors[node.id] = node.pageIndex;
      if (node.children) processNodes(node.children);
    });
  };
  
  processNodes(toc);
  return anchors;
}
