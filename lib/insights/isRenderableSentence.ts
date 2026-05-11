import { BOILERPLATE_RE, PUBLISHER_DEBRIS_RE } from "./renderQualityGate";

export function isRenderableSentence(input: string): boolean {
  const text = (input || "").trim();
  if (!text) return false;
  if (/\.\.\.$/.test(text)) return false;
  // Reject publisher / copyright boilerplate
  if (BOILERPLATE_RE.test(text)) return false;
  if (PUBLISHER_DEBRIS_RE.test(text)) return false;
  // Reject artifact words that signal non-instructional content
  if (/\b(Chapter|Cengage|Figure|Table)\b/.test(text)) return false;
  // Formula exemption: math expressions with operators are valid even at < 6 words
  const isFormula = /[=∫∂∑]|lim\b|d\/d[xt]|\bintegral\b|\bderivative\b/i.test(text);
  if (isFormula && text.split(/\s+/).length >= 2 && /[.!?:=]$/.test(text)) return true;
  if (text.split(/\s+/).length < 6) return false;
  if (/\b(the|a|an|of|to|with|and|or|but|so|because|whereas|therefore|when|which|since)$/i.test(text)) return false;
  if (!/[.!?:]$/.test(text)) return false;
  return true;
}
