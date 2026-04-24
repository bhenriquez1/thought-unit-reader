import { ocrDataUrlToText } from '@/lib/page-intelligence/extractor';

export async function extractOcrPageText(getPageImageDataUrl: () => Promise<string>): Promise<{ text: string; confidence: number }> {
  const imageDataUrl = await getPageImageDataUrl().catch(() => '');
  if (!imageDataUrl) return { text: '', confidence: 0 };
  return ocrDataUrlToText(imageDataUrl);
}
