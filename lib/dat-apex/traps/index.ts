// lib/dat-apex/traps/index.ts

export { buildBiologyTraps } from "./buildBiologyTraps";
export { buildGeneralChemTraps } from "./buildGeneralChemTraps";
export { buildOrganicChemTraps } from "./buildOrganicChemTraps";

import type { DatSubject, DatTopicFamily } from "../types";
import { buildBiologyTraps } from "./buildBiologyTraps";
import { buildGeneralChemTraps } from "./buildGeneralChemTraps";
import { buildOrganicChemTraps } from "./buildOrganicChemTraps";

export function buildTraps(
  pageText: string,
  subject: DatSubject,
  topicFamily: DatTopicFamily,
  explicitTraps: string[]
): string[] {
  if (subject === "biology") return buildBiologyTraps(pageText, topicFamily, explicitTraps);
  if (subject === "general_chemistry") return buildGeneralChemTraps(pageText, topicFamily, explicitTraps);
  if (subject === "organic_chemistry") return buildOrganicChemTraps(pageText, topicFamily, explicitTraps);
  return explicitTraps.slice(0, 4);
}
