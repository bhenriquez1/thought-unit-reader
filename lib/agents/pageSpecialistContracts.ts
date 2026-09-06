import type { CurrentPageTruth } from "@/lib/context/currentPageTruth";

export type PageSpecialist = "professor" | "whiteboard-artist" | "chief-resident" | "highlight";

export interface PageSpecialistIdentity {
  documentId: string;
  pageNumber: number;
  pageTruthKey: string;
  pageContentHash: string;
}

export type SpecialistHandoff =
  | { target: "whiteboard-artist"; source: "professor"; lessonId: string; stepId: number }
  | { target: "chief-resident"; source: "professor" | "highlight"; prompt: string }
  | { target: "professor"; source: "chief-resident" | "highlight"; canonicalUnitId: string };

export interface PageSpecialistEnvelope<T> {
  specialist: PageSpecialist;
  identity: PageSpecialistIdentity;
  input: T;
}

export function pageSpecialistIdentity(truth: CurrentPageTruth): PageSpecialistIdentity {
  return {
    documentId: truth.documentId,
    pageNumber: truth.pageNumber,
    pageTruthKey: truth.pageTruthKey,
    pageContentHash: truth.pageContentHash,
  };
}

/** The coordinator routes typed inputs; specialists never call one another. */
export function routePageSpecialist<T>(
  specialist: PageSpecialist,
  truth: CurrentPageTruth,
  input: T,
): PageSpecialistEnvelope<T> {
  return Object.freeze({ specialist, identity: pageSpecialistIdentity(truth), input });
}

export function isSpecialistResultCurrent(
  result: Pick<PageSpecialistEnvelope<unknown>, "identity">,
  truth: CurrentPageTruth,
): boolean {
  const live = pageSpecialistIdentity(truth);
  return result.identity.documentId === live.documentId
    && result.identity.pageNumber === live.pageNumber
    && result.identity.pageTruthKey === live.pageTruthKey
    && result.identity.pageContentHash === live.pageContentHash;
}

