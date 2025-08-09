// lib/utils.ts
import { twMerge } from "tailwind-merge";
import { clsx, type ClassValue } from "clsx";

/**
 * Combine Tailwind class names with intelligent merging.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(...inputs));
}

/**
 * Slugify a string for ids, filenames, routes, etc.
 * - strips a file extension if present
 * - lowercases
 * - replaces non-alphanumerics with hyphens
 * - trims leading/trailing hyphens
 */
export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/\.[^.]+$/, "") // strip extension if present
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Generate a stable lesson id from a File’s name.
 */
export function lessonIdFromFile(file: File) {
  return slugify(file.name);
}

/**
 * Truncate a string to n characters, adding an ellipsis if needed.
 */
export function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}