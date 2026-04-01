import { useEffect, useRef, useState } from "react";
import { processPage } from "@/lib/insights/processPage";
import type { PageInsightModel } from "@/lib/insights/types";

type PageInsightsState =
  | { status: "idle" | "loading"; pageIndex: number; model: null }
  | { status: "ready"; pageIndex: number; model: PageInsightModel }
  | { status: "error"; pageIndex: number; model: null; message: string };

export function usePageInsights(pageText: string, pageIndex: number, enableDatApex = false): PageInsightsState {
  const [state, setState] = useState<PageInsightsState>({ status: "idle", pageIndex, model: null });
  const versionRef = useRef(0);

  useEffect(() => {
    const version = ++versionRef.current;
    setState({ status: "loading", pageIndex, model: null });
    Promise.resolve().then(() => {
      const model = processPage(pageText || "", enableDatApex);
      if (version !== versionRef.current) return;
      setState({ status: "ready", pageIndex, model });
    }).catch((error: unknown) => {
      if (version !== versionRef.current) return;
      setState({
        status: "error",
        pageIndex,
        model: null,
        message: error instanceof Error ? error.message : "Failed to parse current page.",
      });
    });
  }, [pageText, pageIndex, enableDatApex]);

  return state;
}
