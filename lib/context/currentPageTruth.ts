import { computePageContentHash } from "@/lib/insights/pageContentHash";
import { buildPageTruthKey } from "@/lib/useActivePageIntelligence";
import type { CanonicalEntryInput } from "@/lib/whiteboard/canonicalRelationshipGraph";

/** Immutable, feature-neutral source snapshot shared by every page specialist. */
export interface CurrentPageTruth {
  readonly documentId: string;
  readonly bookId: string;
  readonly documentTitle: string;
  readonly pageNumber: number;
  readonly totalPages: number;
  readonly pageTruthKey: string;
  readonly pageContentHash: string;
  readonly textReady: boolean;
  readonly pageText: string;
  readonly canonicalUnits: readonly CanonicalEntryInput[];
  readonly pageRole: string | null;
  readonly domain: string | null;
  readonly activeCanonicalUnitId: string | null;
}

export interface CreateCurrentPageTruthArgs {
  documentId: string;
  bookId: string;
  documentTitle?: string;
  pageNumber: number;
  totalPages?: number;
  pageText: string;
  textReady: boolean;
  canonicalUnits?: readonly CanonicalEntryInput[];
  pageRole?: string | null;
  domain?: string | null;
  activeCanonicalUnitId?: string | null;
  pageTruthKey?: string;
}

export function createCurrentPageTruth(args: CreateCurrentPageTruthArgs): CurrentPageTruth {
  const pageNumber = Math.max(1, Math.trunc(args.pageNumber));
  const expectedKey = buildPageTruthKey(args.documentId, pageNumber, args.textReady);
  if (args.pageTruthKey && args.pageTruthKey !== expectedKey) {
    throw new Error(`CurrentPageTruth identity mismatch: expected ${expectedKey}`);
  }
  for (const unit of args.canonicalUnits ?? []) {
    if (unit.page != null && unit.page !== pageNumber) {
      throw new Error(`CurrentPageTruth unit ${unit.id} belongs to page ${unit.page}, not ${pageNumber}`);
    }
  }
  return Object.freeze({
    documentId: args.documentId,
    bookId: args.bookId,
    documentTitle: args.documentTitle ?? "",
    pageNumber,
    totalPages: Math.max(0, Math.trunc(args.totalPages ?? 0)),
    pageTruthKey: expectedKey,
    pageContentHash: computePageContentHash(args.documentId, pageNumber, args.pageText),
    textReady: args.textReady,
    pageText: args.pageText,
    canonicalUnits: Object.freeze([...(args.canonicalUnits ?? [])].map((unit) => Object.freeze({ ...unit }))),
    pageRole: args.pageRole ?? null,
    domain: args.domain ?? null,
    activeCanonicalUnitId: args.activeCanonicalUnitId ?? null,
  });
}

export type FrozenCurrentPageTruth = Readonly<CurrentPageTruth>;

export function freezeCurrentPageTruth(truth: CurrentPageTruth): FrozenCurrentPageTruth {
  return truth;
}

export function matchesCurrentPageTruth(
  identity: Pick<CurrentPageTruth, "documentId" | "pageNumber" | "pageTruthKey" | "pageContentHash">,
  truth: CurrentPageTruth,
): boolean {
  return identity.documentId === truth.documentId
    && identity.pageNumber === truth.pageNumber
    && identity.pageTruthKey === truth.pageTruthKey
    && identity.pageContentHash === truth.pageContentHash;
}

