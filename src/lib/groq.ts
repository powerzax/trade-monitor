// Groq caps this account at 8,000 tokens per minute, so one analysis (~5-6k tokens) nearly fills a minute.
// When it refuses, report a clear "wait and retry" with how long, instead of a raw error.
export const RATE_LIMIT_MESSAGE = "AI ทำงานเต็มแล้วในนาทีนี้ รอประมาณ 1 นาทีแล้วลองใหม่";

export async function rateLimitInfo(res: Response): Promise<{ limited: boolean; retryAfter: number; detail: string }> {
  if (res.status !== 429) return { limited: false, retryAfter: 0, detail: "" };
  const detail = await res.text().catch(() => "");
  const header = Number(res.headers.get("retry-after"));
  const fromText = Number(detail.match(/try again in ([\d.]+)s/i)?.[1]);
  const retryAfter = Math.ceil(Number.isFinite(header) && header > 0 ? header : Number.isFinite(fromText) && fromText > 0 ? fromText : 60);
  return { limited: true, retryAfter, detail };
}
