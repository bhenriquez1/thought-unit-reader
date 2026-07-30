"use client";

// components/reader/SemanticSearch.tsx
// Search across canonical units with semantic metadata in results.
//
// Each result shows: matched text snippet, canonical type + icon, importance level,
// and page number — replacing the bare "page 124" of legacy search.
//
// This component is self-contained: it takes entries[] + pack and manages its own
// query state. onSelect forwards the selected entry id to the parent's onJump.

import React, { useState, useMemo, useRef, useEffect } from "react";
import type { SemanticPack } from "@/lib/semantic/types";
import { semanticSearch, buildSearchSnippet } from "@/lib/reader/semanticSearch";
import ImportanceBadge from "./ImportanceBadge";

type SearchableEntry = {
  id: string;
  text: string;
  canonicalType?: string;
  kind?: string;
  priorityTier?: number;
  importanceScore?: number;
  reason?: string;
  title?: string;
  page?: number;
  lineRange?: string;
};

interface SemanticSearchProps<T extends SearchableEntry> {
  entries: T[];
  pack: SemanticPack;
  onSelect: (id: string) => void;
  placeholder?: string;
  maxResults?: number;
  className?: string;
}

export default function SemanticSearch<T extends SearchableEntry>({
  entries,
  pack,
  onSelect,
  placeholder = "Search concepts…",
  maxResults = 10,
  className = "",
}: SemanticSearchProps<T>) {
  const [query, setQuery]       = useState("");
  const [isOpen, setIsOpen]     = useState(false);
  const inputRef                = useRef<HTMLInputElement>(null);
  const containerRef            = useRef<HTMLDivElement>(null);

  const results = useMemo(
    () => semanticSearch(entries, query, pack, maxResults),
    [entries, query, pack, maxResults],
  );

  // Close dropdown on outside click.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(id: string) {
    onSelect(id);
    setQuery("");
    setIsOpen(false);
    inputRef.current?.blur();
  }

  const showDropdown = isOpen && query.trim().length >= 2;

  return (
    <div ref={containerRef} className={`relative ${className}`} data-testid="semantic-search">
      {/* Search input */}
      <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
        <span className="text-[11px] text-white/25 select-none">🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent text-[11px] text-white/80 placeholder:text-white/25 outline-none"
          aria-label="Search canonical units"
          data-testid="semantic-search-input"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setIsOpen(false); }}
            className="text-[10px] text-white/30 hover:text-white/60"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-[#1a1a2e] shadow-xl"
          data-testid="semantic-search-results"
        >
          {results.length === 0 ? (
            <div className="px-3 py-2 text-[10px] text-white/30 italic">
              No matches for "{query}"
            </div>
          ) : (
            results.map((r) => (
              <button
                key={r.entry.id}
                onClick={() => handleSelect(r.entry.id)}
                className="flex w-full flex-col gap-0.5 border-b border-white/5 px-3 py-2 text-left hover:bg-white/5 transition-colors last:border-b-0"
                data-testid="semantic-search-result"
              >
                {/* Type + importance row */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] leading-none">{r.canonicalIcon}</span>
                  <span className="text-[9.5px] font-semibold text-white/55">
                    {r.canonicalLabel}
                  </span>
                  <ImportanceBadge level={r.importanceLevel} size="compact" />
                  {typeof r.entry.page === "number" && (
                    <span className="ml-auto text-[8.5px] text-white/30 tabular-nums">
                      p.{r.entry.page}
                    </span>
                  )}
                </div>

                {/* Snippet */}
                <p className="text-[10.5px] leading-snug text-white/60 line-clamp-2">
                  {buildSearchSnippet(r.entry.text, query)}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
