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

  const prompt = `คุณเป็นนักวิเคราะห์หุ้นและ crypto มืออาชีพระดับ Senior สำหรับ Swing Trader ไทย (ถือ 3-14 วัน) วิเคราะห์อย่างละเอียดและตรงไปตรงมา

ข้อมูลหุ้น/crypto: ${data.symbol} (${data.name})
ราคาปัจจุบัน: $${data.price?.toFixed(2)}
เปลี่ยนแปลงวันนี้: ${data.changePct?.toFixed(2)}%

Technical Indicators:
- RSI(14): ${ind?.rsi?.toFixed(1)} ${ind?.rsi > 70 ? "(Overbought)" : ind?.rsi < 30 ? "(Oversold)" : "(Neutral)"}
- MACD Histogram: ${ind?.macd?.histogram?.toFixed(4)} ${ind?.macd?.histogram > 0 ? "(Bullish momentum)" : "(Bearish momentum)"}
- MACD Line: ${ind?.macd?.macd?.toFixed(4)} | Signal: ${ind?.macd?.signal?.toFixed(4)}
- Bollinger Bands: Upper $${ind?.bb?.upper?.toFixed(2)} | Middle $${ind?.bb?.middle?.toFixed(2)} | Lower $${ind?.bb?.lower?.toFixed(2)}
- ราคาเทียบ BB Middle: ${data.price > ind?.bb?.middle ? "อยู่เหนือ (bullish bias)" : "อยู่ใต้ (bearish bias)"}
- MA20: $${ind?.ma20?.toFixed(2)} | MA50: $${ind?.ma50?.toFixed(2) ?? "N/A"}
- ราคาเทียบ MA20: ${data.price > ind?.ma20 ? "อยู่เหนือ MA20 ✓" : "อยู่ใต้ MA20 ✗"}
- แนวรับ: $${ind?.support?.map((s: number) => s.toFixed(2)).join(", ")}
- แนวต้าน: $${ind?.resistance?.map((r: number) => r.toFixed(2)).join(", ")}
${volumeSection}${analystSection}${fearGreedSection}${newsSection}

วิเคราะห์ครบทุกมิติ แล้วตอบเป็น JSON เท่านั้น (ห้ามมีข้อความนอก JSON):
{
  "tldr": "สรุปสั้น 1-2 ประโยค สำหรับคนไม่อยากอ่านยาว บอกว่าตอนนี้ควรทำอะไร",
  "trend": "bullish" | "bearish" | "neutral",
  "trendTH": "ขาขึ้น" | "ขาลง" | "Sideway",
  "score": 1-10,
  "summary": "วิเคราะห์ภาพรวม 5-6 ประโยค ครอบคลุม technical momentum + แนวรับแนวต้านสำคัญ + fundamental + analyst consensus + sentiment ตลาด + ข่าวที่กระทบ",
  "technicalDetail": "อธิบาย technical setup ละเอียด 2-3 ประโยค เช่น pattern ที่เกิด, crossover, divergence, breakout/breakdown",
  "fundamentalDetail": "อธิบาย fundamental 1-2 ประโยค (ถ้าไม่มีข้อมูล analyst ให้ข้ามได้)",
  "newsSentiment": "positive" | "negative" | "neutral",
  "newsSummaryTH": "สรุปภาพรวมข่าว 2-3 ประโยค บอกว่าข่าวส่งผลต่อ sentiment และราคาระยะสั้น-กลางยังไง",
  "newsItems": [{ "title": "แปลหัวข้อข่าวเป็นไทย", "sentiment": "positive"|"negative"|"neutral", "impact": "อธิบายผลกระทบต่อราคาระยะสั้น 1-2 ประโยค บอกว่าดีหรือแย่ยังไง" }],
  "entryStrategy": {
    "first": ราคาเข้าครั้งแรก (conservative กว่า),
    "second": ราคาเข้าครั้งที่สอง (ถ้าลงต่อ ใช้ average down),
    "reason": "อธิบายเหตุผลการเลือก entry zone นี้ 1-2 ประโยค"
  },
  "targets": {
    "tp1": ราคาเป้าหมายแรก (conservative),
    "tp2": ราคาเป้าหมายที่สอง (optimistic),
    "tp1Reason": "เหตุผล TP1 สั้นๆ",
    "tp2Reason": "เหตุผล TP2 สั้นๆ"
  },
  "stopLoss": ราคา cut loss,
  "stopLossReason": "เหตุผลที่เลือก stop loss ตรงนี้ สั้นๆ",
  "riskReward": อัตราส่วนกำไรต่อขาดทุน (คำนวณจาก TP1),
  "signals": ["สัญญาณบวก 1", "สัญญาณบวก 2", "สัญญาณบวก 3", "สัญญาณบวก 4", "สัญญาณบวก 5"],
  "risks": ["ความเสี่ยง 1", "ความเสี่ยง 2", "ความเสี่ยง 3", "ความเสี่ยง 4"],
  "catalysts": ["catalyst ที่อาจทำให้ราคาขึ้น/ลงใน 1-2 สัปดาห์ เช่น earnings, Fed meeting, product launch, macro data"],
  "suggestion": "Buy" | "Wait" | "Avoid",
  "suggestionTH": "ซื้อได้" | "รอจังหวะ" | "หลีกเลี่ยง",
  "timeframe": "ระยะเวลาถือครองที่แนะนำ เช่น 5-10 วัน",
  "exitStrategy": "กลยุทธ์การออก 1-2 ประโยค เช่น ขายครึ่งที่ TP1 แล้วย้าย stop loss มาที่ entry"
}`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 3000,
        temperature: 0.3,
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
