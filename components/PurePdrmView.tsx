"use client";

// components/PurePdrmView.tsx
// PURE PDRM MODE - Browse all PDRM entries (highlight-linked + page-linked)
// This tab is for browsing/search, NOT the primary workflow (Surgeon View is primary)

import React, { useState, useMemo } from 'react';
import {
  usePdrmStore,
  type PDRMEntry,
  type PDRMType,
  getPdrmTypeColor,
  getPdrmTypeIcon,
  getPdrmTypeLabel
} from '@/lib/stores/pdrmStore';

interface PurePdrmViewProps {
  documentId: string;
  documentName: string;
  currentPage: number;
  pdfPageCount: number;
  onJumpToPage: (pageNumber: number, highlightId?: string) => void;
  onOpenInReader: (pageNumber: number) => void;
  onOpenInSurgeon: (pageNumber: number, highlightId?: string) => void;
}

type GroupByMode = 'page' | 'type' | 'source';
type FilterType = PDRMType | 'general' | 'all' | 'drafts';

export default function PurePdrmView({
  documentId,
  documentName,
  currentPage,
  pdfPageCount,
  onJumpToPage,
  onOpenInReader,
  onOpenInSurgeon
}: PurePdrmViewProps) {
  // Store
  const { getEntriesByDocument, getDraftEntries, deleteEntry, getStats } = usePdrmStore();
  
  // Local state
  const [groupBy, setGroupBy] = useState<GroupByMode>('page');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  // Get all entries for document
  const allEntries = useMemo(() => {
    return getEntriesByDocument(documentId);
  }, [documentId, getEntriesByDocument]);
  
  const draftEntries = useMemo(() => {
    return getDraftEntries(documentId);
  }, [documentId, getDraftEntries]);
  
  // Filter entries
  const filteredEntries = useMemo(() => {
    let entries = allEntries;
    
    // Filter by type
    if (filterType === 'drafts') {
      entries = entries.filter(e => e.status === 'draft');
    } else if (filterType !== 'all') {
      entries = entries.filter(e => e.primaryType === filterType);
    }
    
    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      entries = entries.filter(e =>
        e.evidence.quote.toLowerCase().includes(query) ||
        e.fields.pattern.toLowerCase().includes(query) ||
        e.fields.decisionRule.toLowerCase().includes(query) ||
        e.fields.risk.toLowerCase().includes(query) ||
        e.fields.mnemonic.toLowerCase().includes(query)
      );
    }
    
    return entries;
  }, [allEntries, filterType, searchQuery]);
  
  // Group entries
  const groupedEntries = useMemo(() => {
    const groups: Record<string, PDRMEntry[]> = {};
    
    for (const entry of filteredEntries) {
      let key: string;
      
      switch (groupBy) {
        case 'page':
          key = `Page ${entry.evidence.pageNumber}`;
          break;
        case 'type':
          key = getPdrmTypeLabel(entry.primaryType);
          break;
        case 'source':
          key = entry.sourceType === 'highlight' ? 'From Highlights' : 'From Page Scan';
          break;
        default:
          key = 'All';
      }
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    }
    
    // Sort groups
    const sortedGroups: Record<string, PDRMEntry[]> = {};
    const keys = Object.keys(groups).sort((a, b) => {
      if (groupBy === 'page') {
        const numA = parseInt(a.replace('Page ', '')) || 0;
        const numB = parseInt(b.replace('Page ', '')) || 0;
        return numA - numB;
      }
      return a.localeCompare(b);
    });
    
    for (const key of keys) {
      sortedGroups[key] = groups[key].sort((a, b) => 
        a.evidence.pageNumber - b.evidence.pageNumber
      );
    }
    
    return sortedGroups;
  }, [filteredEntries, groupBy]);
  
  // Stats
  const stats = useMemo(() => getStats(documentId), [documentId, getStats]);
  
  // Toggle group expansion
  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  
  // Expand all by default
  React.useEffect(() => {
    setExpandedGroups(new Set(Object.keys(groupedEntries)));
  }, [Object.keys(groupedEntries).join(',')]);
  
  // Render PDRM entry
  const renderEntry = (entry: PDRMEntry) => {
    const color = getPdrmTypeColor(entry.primaryType);
    const icon = getPdrmTypeIcon(entry.primaryType);
    
    return (
      <div 
        key={entry.id}
        className={`p-3 rounded-lg border transition-all ${
          entry.status === 'draft'
            ? 'bg-yellow-900/20 border-yellow-600/50'
            : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
        }`}
        style={{ borderLeftColor: color, borderLeftWidth: '3px' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <span 
              className="text-xs font-medium px-2 py-0.5 rounded"
              style={{ backgroundColor: color + '30', color }}
            >
              {getPdrmTypeLabel(entry.primaryType)}
            </span>
            {entry.status === 'draft' && (
              <span className="text-xs text-yellow-500 font-medium">DRAFT</span>
            )}
            {entry.sourceType === 'page' && (
              <span className="text-xs text-blue-400">page-gen</span>
            )}
          </div>
          <span className="text-xs text-gray-500">
            p. {entry.evidence.pageNumber}
          </span>
        </div>
        
        {/* PDRM Fields (structured) */}
        <div className="space-y-1.5 text-sm mb-3">
          {entry.fields.pattern && (
            <div className="flex gap-2">
              <span className="text-purple-400 font-medium shrink-0 w-4">P:</span>
              <span className="text-gray-300">{entry.fields.pattern}</span>
            </div>
          )}
          {entry.fields.decisionRule && (
            <div className="flex gap-2">
              <span className="text-blue-400 font-medium shrink-0 w-4">D:</span>
              <span className="text-gray-300">{entry.fields.decisionRule}</span>
            </div>
          )}
          {entry.fields.risk && (
            <div className="flex gap-2">
              <span className="text-red-400 font-medium shrink-0 w-4">R:</span>
              <span className="text-gray-300">{entry.fields.risk}</span>
            </div>
          )}
          {entry.fields.mnemonic && (
            <div className="flex gap-2">
              <span className="text-yellow-400 font-medium shrink-0 w-4">M:</span>
              <span className="text-gray-300 font-semibold">{entry.fields.mnemonic}</span>
            </div>
          )}
          {!entry.fields.pattern && !entry.fields.decisionRule && !entry.fields.risk && !entry.fields.mnemonic && (
            <p className="text-xs text-gray-500 italic">No fields filled{entry.status === 'draft' ? ' (draft)' : ''}</p>
          )}
        </div>
        
        {/* Evidence */}
        <div className="text-xs text-gray-500 italic mb-3 line-clamp-2">
          "{entry.evidence.quote}"
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenInReader(entry.evidence.pageNumber)}
            className="px-2 py-1 bg-blue-600/80 hover:bg-blue-600 rounded text-xs transition-colors"
            data-testid={`pdrm-open-reader-${entry.id}`}
          >
            📖 Reader
          </button>
          <button
            onClick={() => onOpenInSurgeon(entry.evidence.pageNumber, entry.evidence.highlightId)}
            className="px-2 py-1 bg-purple-600/80 hover:bg-purple-600 rounded text-xs transition-colors"
            data-testid={`pdrm-open-surgeon-${entry.id}`}
          >
            🔬 Surgeon
          </button>
          <button
            onClick={() => {
              if (confirm('Delete this PDRM entry?')) {
                deleteEntry(entry.id);
              }
            }}
            className="px-2 py-1 bg-red-900/50 hover:bg-red-900 rounded text-xs transition-colors ml-auto"
          >
            🗑
          </button>
        </div>
      </div>
    );
  };
  
  // Empty state
  if (allEntries.length === 0) {
    return (
      <div className="h-full flex flex-col bg-gray-900" data-testid="pure-pdrm-empty">
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            📊 PDRM Entries
          </h2>
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="text-xl font-semibold text-white mb-2">No PDRM Entries Yet</h3>
          <p className="text-gray-400 mb-4 max-w-md">
            PDRM entries are created in <strong>Surgeon View</strong> when you highlight text.
          </p>
          <ul className="text-sm text-gray-500 text-left space-y-1 mb-6">
            <li>• <span className="text-green-400">Auto mode</span>: Highlights → instant PDRM extraction</li>
            <li>• <span className="text-yellow-400">Manual mode</span>: Highlights → draft PDRM for you to complete</li>
          </ul>
          <button
            onClick={() => onOpenInSurgeon(currentPage)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium transition-colors"
          >
            🔬 Open Surgeon View
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col bg-gray-900" data-testid="pure-pdrm-view">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            📊 PDRM Entries
            <span className="text-sm font-normal text-gray-400">
              ({filteredEntries.length} of {allEntries.length})
            </span>
          </h2>
          
          {/* Stats Summary */}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-purple-400">🔷 {stats.byType.pattern}</span>
            <span className="text-blue-400">⚖️ {stats.byType.decision}</span>
            <span className="text-red-400">⚠️ {stats.byType.risk}</span>
            <span className="text-yellow-400">💡 {stats.byType.mnemonic}</span>
            {stats.drafts > 0 && (
              <span className="text-yellow-500">📝 {stats.drafts} drafts</span>
            )}
          </div>
        </div>
        
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search PDRM entries..."
              className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>
          
          {/* Group By */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Group:</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupByMode)}
              className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white focus:outline-none"
            >
              <option value="page">By Page</option>
              <option value="type">By Type</option>
              <option value="source">By Source</option>
            </select>
          </div>
          
          {/* Filter Type */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Filter:</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as FilterType)}
              className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white focus:outline-none"
            >
              <option value="all">All Types</option>
              <option value="drafts">📝 Drafts Only</option>
              <option value="pattern">🔷 Pattern</option>
              <option value="decision">⚖️ Decision</option>
              <option value="risk">⚠️ Risk</option>
              <option value="mnemonic">💡 Mnemonic</option>
              <option value="general">📝 General</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* Entries List */}
      <div className="flex-1 overflow-auto p-4">
        {Object.keys(groupedEntries).length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No entries match your filters
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedEntries).map(([groupName, entries]) => (
              <div key={groupName} className="border border-gray-700 rounded-lg overflow-hidden">
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(groupName)}
                  className="w-full px-4 py-2 bg-gray-800 flex items-center justify-between hover:bg-gray-750 transition-colors"
                >
                  <span className="font-medium text-white flex items-center gap-2">
                    {expandedGroups.has(groupName) ? '▼' : '▶'}
                    {groupName}
                  </span>
                  <span className="text-xs text-gray-400">
                    {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                  </span>
                </button>
                
                {/* Group Entries */}
                {expandedGroups.has(groupName) && (
                  <div className="p-3 space-y-3 bg-gray-900/50">
                    {entries.map(entry => renderEntry(entry))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
