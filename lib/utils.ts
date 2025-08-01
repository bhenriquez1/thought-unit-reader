// lib/utils.ts

import { twMerge } from "tailwind-merge";
import { clsx, type ClassValue } from "clsx";

/**
 * Combines Tailwind class names with intelligent merging
 * @param inputs - List of class names or conditional class expressions
 * @returns A single string of merged classes
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(...inputs));
}

// Make sure we're explicitly exporting the cn function
export { cn };

// Remove the default export to avoid redeclaration errors
// export default { cn }; - This was causing the error