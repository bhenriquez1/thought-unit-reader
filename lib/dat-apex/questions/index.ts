// lib/dat-apex/questions/index.ts

export { buildBiologyQuestions } from "./buildBiologyQuestions";
export { buildGeneralChemQuestions } from "./buildGeneralChemQuestions";
export { buildOrganicChemQuestions } from "./buildOrganicChemQuestions";

import type { DatQuestion, DatSubject, DatTopicFamily } from "../types";
import type { PdrmBlock } from "../types";
import { buildBiologyQuestions } from "./buildBiologyQuestions";
import { buildGeneralChemQuestions } from "./buildGeneralChemQuestions";
import { buildOrganicChemQuestions } from "./buildOrganicChemQuestions";

export function buildQuestions(
  pdrm: PdrmBlock,
  traps: string[],
  subject: DatSubject,
  topicFamily: DatTopicFamily,
  pageNumber: number
): DatQuestion[] {
  if (subject === "biology") return buildBiologyQuestions(pdrm, traps, topicFamily, pageNumber);
  if (subject === "general_chemistry") return buildGeneralChemQuestions(pdrm, traps, topicFamily, pageNumber);
  if (subject === "organic_chemistry") return buildOrganicChemQuestions(pdrm, traps, topicFamily, pageNumber);
  return [];
}
