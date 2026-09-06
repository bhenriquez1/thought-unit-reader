import { useMemo } from "react";
import {
  createCurrentPageTruth,
  type CreateCurrentPageTruthArgs,
  type CurrentPageTruth,
} from "./currentPageTruth";

/** Composition-root coordinator: creates one stable snapshot per truth change. */
export function useCurrentPageTruth(args: CreateCurrentPageTruthArgs): CurrentPageTruth {
  return useMemo(
    () => createCurrentPageTruth(args),
    [
      args.documentId,
      args.bookId,
      args.documentTitle,
      args.pageNumber,
      args.totalPages,
      args.pageText,
      args.textReady,
      args.pageTruthKey,
      args.canonicalUnits,
      args.pageRole,
      args.domain,
      args.activeCanonicalUnitId,
    ],
  );
}

