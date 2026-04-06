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
  const requestKey = useMemo(() => parseKey || `${pageIndex}:${pageText.slice(0, 64)}:${pageText.length}:${enableDatApex ? "x" : "n"}`, [enableDatApex, pageIndex, pageText, parseKey]);
  const [state, setState] = useState<PageInsightsState>({ status: "idle", pageIndex, model: null, requestKey });
  const versionRef = useRef(0);

  useEffect(() => {
    const version = ++versionRef.current;
    setState({ status: "loading", pageIndex, model: null, requestKey });

    Promise.resolve()
      .then(() => {
        const model = processPage(pageText || "", enableDatApex);
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
