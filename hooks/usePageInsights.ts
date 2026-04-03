import { useEffect, useMemo, useRef, useState } from "react";
import { processPage } from "@/lib/insights/processPage";
import type { PageInsightModel } from "@/lib/insights/types";
import type { SemanticPage } from "@/lib/pdf/buildSemanticPage";

export type PageInsightsStatus = "idle" | "loading" | "ready" | "error";

export type UsePageInsightsArgs = {
  semanticPage: SemanticPage | null;
  documentId: string;
  pageNumber: number;
  mode?: string;
  role?: string;
  depth?: string;
  datFlag?: boolean;
  enabled?: boolean;
};

export type UsePageInsightsResult = {
  status: PageInsightsStatus;
  pageModel: PageInsightModel | null;
  error: string | null;
  parseKey: string;
  sourcePageNumber: number | null;
  isCurrentPage: boolean;
  refresh: () => void;
};

export function usePageInsights({
  semanticPage,
  documentId,
  pageNumber,
  mode = "insight",
  role = "operator",
  depth = "standard",
  datFlag = false,
  enabled = true,
}: UsePageInsightsArgs): UsePageInsightsResult {
  const [status, setStatus] = useState<PageInsightsStatus>("idle");
  const [pageModel, setPageModel] = useState<PageInsightModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const versionRef = useRef(0);

  const semanticHash = useMemo(() => {
    return semanticPage ? hashSemanticPage(semanticPage) : "no-semantic-page";
  }, [semanticPage]);

  const parseKey = useMemo(() => {
    return [
      documentId || "unknown-doc",
      `p:${pageNumber}`,
      `sp:${semanticPage?.pageNumber ?? "none"}`,
      `h:${semanticHash}`,
      `m:${mode}`,
      `r:${role}`,
      `d:${depth}`,
      `x:${datFlag ? "1" : "0"}`,
      `n:${refreshNonce}`,
    ].join("|");
  }, [
    documentId,
    pageNumber,
    semanticPage?.pageNumber,
    semanticHash,
    mode,
    role,
    depth,
    datFlag,
    refreshNonce,
  ]);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setPageModel(null);
      setError(null);
      return;
    }

    if (!documentId || !pageNumber) {
      setStatus("idle");
      setPageModel(null);
      setError(null);
      return;
    }

    if (!semanticPage) {
      setStatus("loading");
      setPageModel(null);
      setError(null);
      return;
    }

    if (semanticPage.pageNumber !== pageNumber) {
      setStatus("loading");
      setPageModel(null);
      setError(null);
      return;
    }

    const currentVersion = ++versionRef.current;

    setStatus("loading");
    setPageModel(null);
    setError(null);

    Promise.resolve()
      .then(() => processPage(semanticPage))
      .then((result) => {
        if (currentVersion !== versionRef.current) return;
        setPageModel(result);
        setStatus("ready");
        setError(null);
      })
      .catch((err: unknown) => {
        if (currentVersion !== versionRef.current) return;
        setPageModel(null);
        setStatus("error");
        setError(getErrorMessage(err));
      });
  }, [enabled, documentId, pageNumber, semanticPage, parseKey]);

  const refresh = () => {
    setRefreshNonce((n) => n + 1);
  };

  const sourcePageNumber = semanticPage?.pageNumber ?? null;
  const isCurrentPage =
    Boolean(pageModel) &&
    sourcePageNumber === pageNumber &&
    semanticPage?.pageNumber === pageNumber;

  return {
    status,
    pageModel,
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
  return "Failed to build page insights.";
}

function hashSemanticPage(page: SemanticPage): string {
  const headingPart = page.headings
    .map((h) => `${h.text}#${h.level}#${h.pageNumber}`)
    .join("||");

  const paragraphPart = page.paragraphs.map((p) => `${p.id}#${p.text}`).join("||");

  const sentencePart = page.sentences.map((s) => `${s.id}#${s.text}`).join("||");

  const raw = [
    `page:${page.pageNumber}`,
    `headings:${headingPart}`,
    `paragraphs:${paragraphPart}`,
    `sentences:${sentencePart}`,
    `confidence:${page.extractionConfidence}`,
  ].join("|||");

  return simpleHash(raw);
}

function simpleHash(input: string): string {
  let hash = 2166136261;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return (hash >>> 0).toString(36);
}
