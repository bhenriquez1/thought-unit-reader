// lib/dat-apex/pdrm/index.ts

export { buildBiologyPdrm } from "./buildBiologyPdrm";
export { buildGeneralChemPdrm } from "./buildGeneralChemPdrm";
export { buildOrganicChemPdrm } from "./buildOrganicChemPdrm";

import type { PdrmBlock, DatSubject, DatTopicFamily } from "../types";
import type { PageGraphInput } from "../buildDatApexPageModel";
import { buildBiologyPdrm } from "./buildBiologyPdrm";
import { buildGeneralChemPdrm } from "./buildGeneralChemPdrm";
import { buildOrganicChemPdrm } from "./buildOrganicChemPdrm";

export function buildPdrm(
  graph: PageGraphInput,
  subject: DatSubject,
  topicFamily: DatTopicFamily
): PdrmBlock {
  if (subject === "biology") return buildBiologyPdrm(graph, topicFamily);
  if (subject === "general_chemistry") return buildGeneralChemPdrm(graph, topicFamily);
  if (subject === "organic_chemistry") return buildOrganicChemPdrm(graph, topicFamily);

  const first = (...candidates: Array<string | null | undefined>) => {
    for (const c of candidates) { const s = (c ?? "").trim(); if (s) return s; }
    return "";
  };
  return {
    pattern: first(graph.mainSignal, graph.pageSummary, ""),
    decision: first(graph.supportSignals?.[0], ""),
    reason: first(graph.supportSignals?.[1], ""),
    miss: first(graph.traps?.[0], ""),
  };
}
