import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const data = await req.json();
  const ind = data.indicators;
  const ana = data.analystData;
  const fg = data.fearGreed;

  const analystSection = ana ? `
Analyst Ratings (Wall Street):
- คำแนะนำรวม: ${ana.recommendation ?? "N/A"} (จาก ${ana.analystCount ?? "?"} analysts)
- ราคาเป้าหมาย: $${ana.targetPrice?.toFixed(2) ?? "N/A"} (Low $${ana.targetLow?.toFixed(2) ?? "?"} / High $${ana.targetHigh?.toFixed(2) ?? "?"})
- Strong Buy: ${ana.strongBuy ?? 0} | Buy: ${ana.buy ?? 0} | Hold: ${ana.hold ?? 0} | Sell: ${ana.sell ?? 0} | Strong Sell: ${ana.strongSell ?? 0}
- P/E: ${ana.peRatio?.toFixed(1) ?? "N/A"} | Forward P/E: ${ana.forwardPE?.toFixed(1) ?? "N/A"}
- EPS: $${ana.eps?.toFixed(2) ?? "N/A"} | EPS Next Q (est.): $${ana.epsNextQuarter?.toFixed(2) ?? "N/A"}
- Revenue Growth: ${ana.revenueGrowth ? (ana.revenueGrowth * 100).toFixed(1) + "%" : "N/A"}
- Profit Margin: ${ana.profitMargin ? (ana.profitMargin * 100).toFixed(1) + "%" : "N/A"}` : "";

  const fearGreedSection = fg
    ? `\nCNN Fear & Greed Index: ${fg.score}/100 (${fg.rating})`
    : "";

  const volumeSection = ind ? `
Volume Analysis:
- Volume Ratio (เทียบ avg 20 วัน): ${ind.volumeRatio}x ${ind.volumeRatio > 1.5 ? "⚠ Volume สูงผิดปกติ" : ind.volumeRatio < 0.7 ? "(Volume ต่ำ)" : "(ปกติ)"}
- Avg Volume 20d: ${ind.avgVolume20d?.toLocaleString() ?? "N/A"}` : "";

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
- RSI(14): ${ind?.rsi?.toFixed(1)} ${ind?.rsi > 70 ? "(Overbought)" : ind?.rsi < 30 ? "(Oversold)" : ""}
- MACD Histogram: ${ind?.macd?.histogram?.toFixed(4)} ${ind?.macd?.histogram > 0 ? "(Bullish)" : "(Bearish)"}
- Bollinger Bands: Upper $${ind?.bb?.upper?.toFixed(2)} | Middle $${ind?.bb?.middle?.toFixed(2)} | Lower $${ind?.bb?.lower?.toFixed(2)}
- MA20: $${ind?.ma20?.toFixed(2)} | MA50: $${ind?.ma50?.toFixed(2) ?? "N/A"}
- แนวรับ: $${ind?.support?.map((s: number) => s.toFixed(2)).join(", ")}
- แนวต้าน: $${ind?.resistance?.map((r: number) => r.toFixed(2)).join(", ")}
${volumeSection}${analystSection}${fearGreedSection}${newsSection}

วิเคราะห์โดยรวมทุกมิติ (Technical + Fundamental + Analyst + Sentiment + News) แล้วตอบเป็น JSON:
{
  "trend": "bullish" | "bearish" | "neutral",
  "trendTH": "ขาขึ้น" | "ขาลง" | "Sideway",
  "score": 1-10,
  "summary": "สรุปภาพรวม 3-4 ประโยคภาษาไทย ครอบคลุม technical + fundamental + sentiment",
  "newsSentiment": "positive" | "negative" | "neutral",
  "newsSummaryTH": "สรุปข่าวและ sentiment ตลาด 1-2 ประโยคภาษาไทย",
  "newsItems": [{ "title": "แปลหัวข้อข่าวเป็นไทย", "sentiment": "positive"|"negative"|"neutral", "impact": "ผลกระทบต่อราคาสั้นๆ" }],
  "entryZone": { "min": ราคาต่ำสุดที่ควรเข้า, "max": ราคาสูงสุดที่ควรเข้า },
  "targetPrice": ราคาเป้าหมาย,
  "stopLoss": ราคา cut loss,
  "riskReward": อัตราส่วนกำไรต่อขาดทุน,
  "signals": ["สัญญาณบวก 1", "สัญญาณบวก 2", "สัญญาณบวก 3"],
  "risks": ["ความเสี่ยง 1", "ความเสี่ยง 2"],
  "suggestion": "Buy" | "Wait" | "Avoid",
  "suggestionTH": "ซื้อได้" | "รอจังหวะ" | "หลีกเลี่ยง",
  "timeframe": "ระยะเวลาถือครองที่แนะนำ"
}

ตอบเฉพาะ JSON เท่านั้น`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048, temperature: 0.3 },
        }),
      }
    );
    if (!res.ok) throw new Error(await res.text());
    const result = await res.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const analysis = JSON.parse(jsonMatch[0]);
    return NextResponse.json(analysis);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Analysis failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
