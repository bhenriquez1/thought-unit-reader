import { ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind class strings with intelligent deduplication.
 * @param inputs - Accepts class names as string, array, or conditional objects.
 * @returns A single merged class string.
 */
function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export { cn };