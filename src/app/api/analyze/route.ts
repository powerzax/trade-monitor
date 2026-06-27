import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const data = await req.json();

  const newsSection = data.news?.length
    ? `\nข่าวล่าสุด (${data.news.length} รายการ):\n` +
      data.news.map((n: { title: string; description: string }, i: number) =>
        `${i + 1}. ${n.title}${n.description ? ` — ${n.description}` : ""}`
      ).join("\n")
    : "";

  const prompt = `คุณเป็นนักวิเคราะห์หุ้นและ crypto มืออาชีพสำหรับ Swing Trader (ถือ 3-14 วัน)

ข้อมูลหุ้น/crypto: ${data.symbol} (${data.name})
ราคาปัจจุบัน: $${data.price?.toFixed(2)}
เปลี่ยนแปลง: ${data.changePct?.toFixed(2)}%

Technical Indicators:
- RSI(14): ${data.indicators?.rsi?.toFixed(1)}
- MACD: ${data.indicators?.macd?.macd?.toFixed(4)} | Signal: ${data.indicators?.macd?.signal?.toFixed(4)} | Histogram: ${data.indicators?.macd?.histogram?.toFixed(4)}
- Bollinger Bands: Upper ${data.indicators?.bb?.upper?.toFixed(2)} | Middle ${data.indicators?.bb?.middle?.toFixed(2)} | Lower ${data.indicators?.bb?.lower?.toFixed(2)}
- MA20: $${data.indicators?.ma20?.toFixed(2)} | MA50: $${data.indicators?.ma50?.toFixed(2) ?? "N/A"}
- แนวรับ (Support): $${data.indicators?.support?.map((s: number) => s.toFixed(2)).join(", ")}
- แนวต้าน (Resistance): $${data.indicators?.resistance?.map((r: number) => r.toFixed(2)).join(", ")}
${newsSection}

วิเคราะห์และตอบเป็น JSON ตามนี้:
{
  "trend": "bullish" | "bearish" | "neutral",
  "trendTH": "ขาขึ้น" | "ขาลง" | "Sideway",
  "score": 1-10,
  "summary": "สรุปภาพรวมสถานการณ์ปัจจุบัน 3-4 ประโยค เป็นภาษาไทยชัดเจน รวม technical และ news sentiment",
  "newsSentiment": "positive" | "negative" | "neutral",
  "newsSummaryTH": "สรุปภาพรวมข่าวล่าสุด 1-2 ประโยคภาษาไทย",
  "newsItems": [
    { "title": "หัวข้อข่าวแปลเป็นภาษาไทย", "sentiment": "positive" | "negative" | "neutral", "impact": "สั้นๆ ว่ากระทบราคาอย่างไร" }
  ],
  "entryZone": { "min": ราคาต่ำสุด, "max": ราคาสูงสุดที่ควรเข้า },
  "targetPrice": ราคาเป้าหมาย,
  "stopLoss": ราคา cut loss,
  "riskReward": อัตราส่วนกำไร/ขาดทุน,
  "signals": ["signal 1 เป็นภาษาไทย", "signal 2", "signal 3"],
  "risks": ["ความเสี่ยง 1 เป็นภาษาไทย", "ความเสี่ยง 2"],
  "suggestion": "Buy" | "Wait" | "Avoid",
  "suggestionTH": "ซื้อได้" | "รอจังหวะ" | "หลีกเลี่ยง",
  "timeframe": "ระยะเวลาถือครองที่แนะนำ"
}

ตอบเฉพาะ JSON เท่านั้น ไม่ต้องมีข้อความอื่น`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const result = await res.json();
    const text = result.choices?.[0]?.message?.content ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const analysis = JSON.parse(jsonMatch[0]);

    return NextResponse.json(analysis);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Analysis failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
