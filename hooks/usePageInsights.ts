import { useEffect, useMemo, useRef, useState } from "react";
import { processPage } from "@/lib/insights/processPage";
import type { PageInsightModel } from "@/lib/insights/types";

type PageInsightsState =
  | { status: "idle" | "loading"; pageIndex: number; model: null; requestKey: string }
  | { status: "ready"; pageIndex: number; model: PageInsightModel; requestKey: string }
  | { status: "error"; pageIndex: number; model: null; message: string; requestKey: string };

export function usePageInsights(
  pageText: string,
  pageIndex: number,
  enableDatApex = false,
  parseKey?: string,
): PageInsightsState {
  const textFingerprint = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < pageText.length; i += 1) hash = (hash * 31 + pageText.charCodeAt(i)) | 0;
    return String(hash);
  }, [pageText]);
  const requestKey = useMemo(() => parseKey || `${pageIndex}:${textFingerprint}:${enableDatApex ? "x" : "n"}`, [enableDatApex, pageIndex, textFingerprint, parseKey]);
  const [state, setState] = useState<PageInsightsState>({ status: "idle", pageIndex, model: null, requestKey });
  const versionRef = useRef(0);

  useEffect(() => {
    const version = ++versionRef.current;
    setState({ status: "loading", pageIndex, model: null, requestKey });

    Promise.resolve()
      .then(() => {
        const parsed = processPage(pageText || "", enableDatApex);
        const model: PageInsightModel = {
          ...parsed,
          pageNumber: pageIndex,
          requestKey,
        };
        if (version !== versionRef.current) return;
        setState({ status: "ready", pageIndex, model, requestKey });
      })
      .catch((error: unknown) => {
        if (version !== versionRef.current) return;
        setState({
          status: "error",
          pageIndex,
          model: null,
          requestKey,
          message: error instanceof Error ? error.message : "Failed to parse current page.",
        });
      });
  }, [enableDatApex, pageIndex, pageText, requestKey]);

  return state;
}
