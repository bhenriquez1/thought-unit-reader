import { useMemo } from "react";
import { processPage } from "@/lib/insights/processPage";

export function usePageInsights(pageText: string, enableDatApex = false) {
  return useMemo(() => processPage(pageText || "", enableDatApex), [pageText, enableDatApex]);
}
