export function isRenderableSentence(input: string): boolean {
  const text = (input || "").trim();
  if (!text) return false;
  if (/\.\.\.$/.test(text)) return false;
  // Formula exemption: math expressions with operators are valid even at < 5 words
  const isFormula = /[=∫∂∑]|lim\b|d\/d[xt]|\bintegral\b|\bderivative\b/i.test(text);
  if (isFormula && text.split(/\s+/).length >= 2 && /[.!?:=]$/.test(text)) return true;
  if (text.split(/\s+/).length < 5) return false;
  if (/\b(and|or|but|so|because|whereas)$/i.test(text)) return false;
  if (!/[.!?:]$/.test(text)) return false;
  return true;
}
