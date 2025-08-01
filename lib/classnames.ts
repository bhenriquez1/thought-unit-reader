// lib/classnames.ts

import { twMerge } from "tailwind-merge";
import { clsx, type ClassValue } from "clsx";

/**
 * Combines Tailwind class names with intelligent merging
 * @param inputs - List of class names or conditional class expressions
 * @returns A single string of merged classes
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(...inputs));
}

// Remove the default export to avoid redeclaration errors