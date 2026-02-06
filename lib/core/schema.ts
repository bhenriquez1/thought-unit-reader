/**
 * ⚡ Core Zod Validators
 *
 * Anti-over-generation protection with strict validation:
 * - Max 8 items per extraction
 * - Max 12 total sentences
 * - Max 160 chars per sentence
 * - Max 3 triggers per item
 * - Max 2 exceptions per item
 */

import { z } from 'zod';

// ============================================================================
// Constants
// ============================================================================

export const CORE_LIMITS = {
  MAX_ITEMS: 8,
  MAX_SENTENCES_TOTAL: 12,
  MAX_SENTENCE_LENGTH: 160,
  MAX_TRIGGERS_PER_ITEM: 3,
  MAX_EXCEPTIONS_PER_ITEM: 2,
  DEFAULT_PARAGRAPH_WINDOW: 4,
} as const;

// ============================================================================
// Trigger Schema
// ============================================================================

export const TriggerEnum = z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
export type TriggerType = z.infer<typeof TriggerEnum>;

// ============================================================================
// Core Item Schema
// ============================================================================

export const ExceptionSchema = z.object({
  trigger: TriggerEnum,
  sentence: z.string().max(CORE_LIMITS.MAX_SENTENCE_LENGTH, {
    message: `Exception sentence must be ≤${CORE_LIMITS.MAX_SENTENCE_LENGTH} chars`,
  }),
});

export const AttachmentsAvailableSchema = z.object({
  procedure: z.boolean(),
  example: z.boolean(),
  visual: z.boolean(),
});

export const SourceSchema = z.object({
  page: z.number().int().positive().nullable(),
  paragraph_index: z.number().int().nonnegative().nullable(),
  char_range: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
});

export const CoreItemSchema = z.object({
  id: z.string().min(1),
  core_sentence: z.string()
    .min(1)
    .max(CORE_LIMITS.MAX_SENTENCE_LENGTH, {
      message: `Core sentence must be ≤${CORE_LIMITS.MAX_SENTENCE_LENGTH} chars`,
    }),
  triggers: z.array(TriggerEnum)
    .max(CORE_LIMITS.MAX_TRIGGERS_PER_ITEM, {
      message: `Max ${CORE_LIMITS.MAX_TRIGGERS_PER_ITEM} triggers per item`,
    }),
  exceptions: z.array(ExceptionSchema)
    .max(CORE_LIMITS.MAX_EXCEPTIONS_PER_ITEM, {
      message: `Max ${CORE_LIMITS.MAX_EXCEPTIONS_PER_ITEM} exceptions per item`,
    }),
  confidence: z.number().min(0).max(1),
  source: SourceSchema,
  attachments_available: AttachmentsAvailableSchema,
});

export type CoreItemType = z.infer<typeof CoreItemSchema>;

// ============================================================================
// Core Response Schema
// ============================================================================

export const ScopeSchema = z.object({
  book_id: z.string().min(1),
  chapter: z.string().nullable(),
  page: z.number().int().positive().nullable(),
  paragraph_range: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
});

export const StatsSchema = z.object({
  input_paragraphs: z.number().int().nonnegative(),
  items_returned: z.number().int().nonnegative().max(CORE_LIMITS.MAX_ITEMS),
  sentences_total: z.number().int().nonnegative().max(CORE_LIMITS.MAX_SENTENCES_TOTAL),
});

export const CoreResponseSchema = z.object({
  version: z.literal('core.v1'),
  scope: ScopeSchema,
  items: z.array(CoreItemSchema).max(CORE_LIMITS.MAX_ITEMS, {
    message: `Max ${CORE_LIMITS.MAX_ITEMS} items per extraction`,
  }),
  stats: StatsSchema,
  stop_reason: z.enum(['clarity_reached', 'cap_reached']),
});

export type CoreResponseType = z.infer<typeof CoreResponseSchema>;

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate and parse a Core response
 * Returns parsed data or throws ZodError
 */
export function validateCoreResponse(data: unknown): CoreResponseType {
  return CoreResponseSchema.parse(data);
}

/**
 * Safe validation that returns result object
 */
export function safeParseCoreResponse(data: unknown): z.SafeParseReturnType<unknown, CoreResponseType> {
  return CoreResponseSchema.safeParse(data);
}

/**
 * Validate a single Core item
 */
export function validateCoreItem(data: unknown): CoreItemType {
  return CoreItemSchema.parse(data);
}

/**
 * Count total sentences in a Core response
 */
export function countSentences(response: CoreResponseType): number {
  return response.items.reduce((total, item) => {
    // 1 for core_sentence + count of exception sentences
    return total + 1 + item.exceptions.length;
  }, 0);
}

/**
 * Truncate response to meet limits if validation fails
 */
export function truncateToLimits(items: CoreItemType[]): CoreItemType[] {
  const truncated = items.slice(0, CORE_LIMITS.MAX_ITEMS);

  let totalSentences = 0;
  const result: CoreItemType[] = [];

  for (const item of truncated) {
    const itemSentences = 1 + item.exceptions.length;

    if (totalSentences + itemSentences <= CORE_LIMITS.MAX_SENTENCES_TOTAL) {
      result.push(item);
      totalSentences += itemSentences;
    } else if (totalSentences < CORE_LIMITS.MAX_SENTENCES_TOTAL) {
      // Truncate exceptions to fit
      const allowedExceptions = CORE_LIMITS.MAX_SENTENCES_TOTAL - totalSentences - 1;
      result.push({
        ...item,
        exceptions: item.exceptions.slice(0, Math.max(0, allowedExceptions)),
      });
      break;
    } else {
      break;
    }
  }

  return result;
}

// ============================================================================
// Paragraph Schema
// ============================================================================

export const ParagraphMetaSchema = z.object({
  index: z.number().int().nonnegative(),
  topPx: z.number().nonnegative(),
  bottomPx: z.number().nonnegative(),
  text: z.string(),
  charStart: z.number().int().nonnegative(),
  charEnd: z.number().int().nonnegative(),
});

export type ParagraphMetaType = z.infer<typeof ParagraphMetaSchema>;
