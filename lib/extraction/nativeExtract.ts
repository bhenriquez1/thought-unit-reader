export async function extractNativePageText(getNativeText: () => Promise<string>): Promise<string> {
  const text = await getNativeText().catch(() => '');
  return (text || '').trim();
}
