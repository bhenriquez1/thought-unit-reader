"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import mammoth from "mammoth";
import { getDocument, GlobalWorkerOptions, version as pdfjsVersion } from "pdfjs-dist";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import Loader from "@/components/ui/loader";
import HybridReader from "@/components/HybridReader";
import { cn } from "../lib/utils";
import { Chapter } from "@/types/chapter";

// Configure PDF worker
GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.js`;

export async function extractText(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "pdf") {
    const pdfjsLib = await import("pdfjs-dist/build/pdf");
    const pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.entry");
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;

    const textContent = await Promise.all(
      Array.from({ length: numPages }, async (_, i) => {
        const page = await pdf.getPage(i + 1);
        const text = await page.getTextContent();
        return text.items.map((item: any) => item.str).join(" ");
      })
    );

    return textContent.join("\n\n");
  } else if (extension === "docx") {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } else if (extension === "txt") {
    return await file.text();
  }

  throw new Error("Unsupported file type.");
}

export function parseIntoUnits(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+(?=[A-Z0-9])/) // match sentence endings followed by capital letter/number
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function splitIntoChapters(text: string): Chapter[] {
  const lines = text.split("\n");
  const chapters: Chapter[] = [];
  let currentChapter: Chapter = { title: "", content: "" };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(chapter|section|unit|lesson|part)\s+\d+/i.test(trimmed)) {
      if (currentChapter.title || currentChapter.content) {
        chapters.push(currentChapter);
        currentChapter = { title: "", content: "" };
      }
      currentChapter.title = trimmed;
    } else {
      currentChapter.content += line + "\n";
    }
  }

  if (currentChapter.title || currentChapter.content) {
    chapters.push(currentChapter);
  }

  return chapters;
}

export async function parseBookWithChapters(file: File): Promise<{
  parsedUnits: string[][];
  chapters: Chapter[];
  original: string;
}> {
  const text = await extractText(file);
  const chapters = splitIntoChapters(text);
  const parsedUnits = chapters.map((c) => parseIntoUnits(c.content));

  return {
    parsedUnits,
    chapters,
    original: text,
  };
}

export function generateProgressiveReadingHTML(inputText: string): JSX.Element {
  const sentences = inputText.match(/[^.!?\n]+[.!?\n]+/g) || [];

  return (
    <div className="space-y-2 text-base leading-relaxed">
      {sentences.map((sentence, i) => (
        <p key={i} className={i % 2 === 0 ? "text-white" : "text-gray-400"}>
          {sentence.trim()}
        </p>
      ))}
    </div>
  );
}

export function parseTextToThoughtUnits(text: string): string[][] {
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/) // sentence boundaries
    .filter((s) => s.length > 0)
    .map((s) => s.trim());

  return sentences.map((sentence) =>
    sentence.split(/([,;:\-–\(\)\[\]\{\}]|\s+)/).filter(Boolean)
  );
}

export function generateProgressiveReadingJSX(text: string): JSX.Element {
  const thoughtUnits = parseTextToThoughtUnits(text);
  return (
    <div className="space-y-4">
      {thoughtUnits.map((unit, idx) => (
        <p key={idx} className="text-lg font-medium text-white bg-gray-800 p-2 rounded shadow">
          {unit.map((word, i) => (
            <span key={i} className={i % 2 === 0 ? "text-white" : "text-gray-400"}>
              {word}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

export function generateHybridHTML(chapters: Chapter[], units: string[][]): string {
  const toc = chapters
    .map((ch, i) => `
      <li class="mb-2">
        <a href="#chapter-${i}" class="text-blue-600 underline font-medium">
          ${ch.title}
        </a> — Page ${ch.page ?? i + 1}
      </li>`)
    .join("");

  let chapterCounter = 0;
  const body = units.flatMap((unit, i) => {
    const joined = unit.join(" ");
    if (joined.startsWith("###CHAPTER:")) {
      const title = joined.replace("###CHAPTER:", "").trim();
      const header = `<h3 id="chapter-${chapterCounter}" class="text-lg font-semibold mt-8 mb-4">${title}</h3>`;
      chapterCounter++;
      return [header];
    }
    const colorClass = i % 2 === 0 ? "text-black" : "text-gray-500";
    return [`<p id="unit-${i}" class="${colorClass} mt-2 text-base leading-relaxed">${joined}</p>`];
  }).join("\n");

  return `
    <div class="flex flex-col gap-6">
      <div class="sticky top-0 bg-white dark:bg-zinc-900 z-10 p-4 border-b border-gray-300 dark:border-zinc-700">
        <h2 class="text-xl font-semibold mb-2">Table of Contents</h2>
        <ul class="list-none pl-0">${toc}</ul>
      </div>
      <hr class="my-4 border-gray-300 dark:border-zinc-600"/>
      ${body}
    </div>
  `;
}

export function getPdfViewerHTML(file: File, scale: number): JSX.Element {
  const url = URL.createObjectURL(file);
  return (
    <div className="mt-8 bg-white p-4 rounded shadow">
      <p className="text-sm text-gray-500 mb-2">
        PDF viewer embedded below (scale: {scale}x):
      </p>
      <object
        data={url}
        type="application/pdf"
        width="100%"
        height="600px"
      >
        <p>
          Your browser does not support PDFs.
          <a href={url} className="text-blue-500 underline ml-1">Download PDF</a>
        </p>
      </object>
    </div>
  );
}