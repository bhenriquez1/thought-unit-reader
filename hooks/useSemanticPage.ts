import { useEffect, useMemo, useRef, useState } from "react";
import { buildSemanticPage, type SemanticPage } from "@/lib/pdf/buildSemanticPage";
import type { RawLine } from "@/lib/pdf/reconstructParagraphs";

export type SemanticPageStatus = "idle" | "loading" | "ready" | "error";

export type UseSemanticPageArgs = {
  documentId: string;
  pageNumber: number;
  rawLines: RawLine[];
  mode?: string;
  role?: string;
  depth?: string;
  datFlag?: boolean;
  enabled?: boolean;
  documentStats?: {
    avgParagraphFontSize?: number;
    dominantLeftX?: number;
    commonHeadingPatterns?: string[];
  };
  headingConfig?: {
    minScore?: number;
    maxLevels?: number;
  };
};

export type UseSemanticPageResult = {
  status: SemanticPageStatus;
  semanticPage: SemanticPage | null;
  error: string | null;
  parseKey: string;
  sourcePageNumber: number | null;
  isCurrentPage: boolean;
  refresh: () => void;
};

export function useSemanticPage({
  documentId,
  pageNumber,
  rawLines,
  mode = "insight",
  role = "operator",
  depth = "standard",
  datFlag = false,
  enabled = true,
  documentStats,
  headingConfig,
}: UseSemanticPageArgs): UseSemanticPageResult {
  const [status, setStatus] = useState<SemanticPageStatus>("idle");
  const [semanticPage, setSemanticPage] = useState<SemanticPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const parseVersionRef = useRef(0);

  const pageTextHash = useMemo(() => {
    return hashRawLines(rawLines);
  }, [rawLines]);

  const parseKey = useMemo(() => {
    return [
      documentId || "unknown-doc",
      `p:${pageNumber}`,
      `h:${pageTextHash}`,
      `m:${mode}`,
      `r:${role}`,
      `d:${depth}`,
      `x:${datFlag ? "1" : "0"}`,
      `n:${refreshNonce}`,
    ].join("|");
  }, [documentId, pageNumber, pageTextHash, mode, role, depth, datFlag, refreshNonce]);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setSemanticPage(null);
      setError(null);
      return;
    }

    if (!documentId || !pageNumber) {
      setStatus("idle");
      setSemanticPage(null);
      setError(null);
      return;
    }

    if (!rawLines || rawLines.length === 0) {
      setStatus("loading");
      setSemanticPage(null);
      setError(null);
      return;
    }

    const currentVersion = ++parseVersionRef.current;

    setStatus("loading");
    setError(null);
    setSemanticPage(null);

    Promise.resolve()
      .then(() =>
        buildSemanticPage({
          pageNumber,
          rawLines,
          documentStats,
          headingConfig,
        }),
      )
      .then((result) => {
        if (currentVersion !== parseVersionRef.current) return;
        setSemanticPage(result);
        setStatus("ready");
        setError(null);
      })
      .catch((err: unknown) => {
        if (currentVersion !== parseVersionRef.current) return;
        setSemanticPage(null);
        setStatus("error");
        setError(getErrorMessage(err));
      });
  }, [
    enabled,
    documentId,
    pageNumber,
    rawLines,
    parseKey,
    documentStats,
    headingConfig,
  ]);

  const refresh = () => {
    setRefreshNonce((n) => n + 1);
  };

  const sourcePageNumber = semanticPage?.pageNumber ?? null;
  const isCurrentPage = sourcePageNumber === pageNumber;

  return {
    status,
    semanticPage,
    error,
    parseKey,
    sourcePageNumber,
    isCurrentPage,
    refresh,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Failed to build semantic page.";
}

function hashRawLines(lines: RawLine[]): string {
  const joined = lines
    .map((line) => {
      const text = (line.text || "").replace(/\s+/g, " ").trim();
      const x = line.x ?? "";
      const y = line.y ?? "";
      const fs = line.fontSize ?? "";
      return `${text}#${x}#${y}#${fs}`;
    })
    .join("||");

  return simpleHash(joined);
}

function simpleHash(input: string): string {
  let hash = 2166136261;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return (hash >>> 0).toString(36);
}
