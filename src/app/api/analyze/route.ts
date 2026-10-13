import { NextRequest, NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";
import { getLatestAccuracy } from "@/lib/accuracy";
import { getCalibration } from "@/lib/calibrate";
import { tradeOdds } from "@/lib/odds";

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
- Volume Pattern: ${ind.volumePattern === "bullish" ? "Bullish (ราคาขึ้น+volume สูง)" : ind.volumePattern === "bearish" ? "Bearish (ราคาลง+volume สูง)" : "Neutral/Weak"}
- Avg Volume 20d: ${ind.avgVolume20d?.toLocaleString() ?? "N/A"}` : "";

  const flowSection = ind?.plain ? `
ทิศทาง/เงินทุน/จังหวะ:
- Supertrend: ${ind.supertrend.dir === 1 ? "ขาขึ้น" : "ขาลง"} ต่อเนื่อง ${ind.supertrend.days} วัน (เส้นอยู่ที่ $${ind.supertrend.line})
- เงินไหล (OBV): ${ind.moneyFlow === "in" ? "ไหลเข้า" : ind.moneyFlow === "out" ? "ไหลออก" : "ทรงตัว"} | MFI: ${ind.mfi ?? "N/A"} | StochRSI: ${ind.stochRsi}
- ความผันผวน ATR(14): $${ind.atr}/วัน (${ind.atrPct}%) ระดับ${ind.plain.volatility.level === "high" ? "สูงกว่าปกติ" : ind.plain.volatility.level === "low" ? "ต่ำกว่าปกติ" : "ปกติ"}
- Stop loss ตามความผันผวน (ราคา − 1.5×ATR): $${ind.stopZone.upper} | โซน stop: $${ind.stopZone.lower}–$${ind.stopZone.upper}
กฎ stop loss: ใช้ค่าตาม ATR ข้างบนเป็นหลัก ปรับให้อยู่ใต้แนวรับได้ แต่ห้ามห่างจากราคาน้อยกว่า 1×ATR ($${ind.atr}) เพราะจะโดนสะบัดหลุดง่าย` : "";

  const mk = data.market;
  const marketSection = mk ? `
ตลาดรวม (${mk.regime === "risk_on" ? "Risk-on เอื้อต่อการถือ" : mk.regime === "risk_off" ? "Risk-off ระวัง" : "กลางๆ"}):
- S&P 500 (SPY): ${mk.spy ? `${mk.spy.changePct}% วันนี้, ${mk.spy.perf20d}% ใน 20 วัน, ${mk.spy.aboveMa50 ? "เหนือ" : "ใต้"} MA50` : "N/A"}
- Nasdaq (QQQ): ${mk.qqq ? `${mk.qqq.changePct}% วันนี้, ${mk.qqq.perf20d}% ใน 20 วัน, ${mk.qqq.aboveMa50 ? "เหนือ" : "ใต้"} MA50` : "N/A"}
- VIX: ${mk.vix ?? "N/A"} ${mk.vix > 25 ? "(ตลาดกลัวสูง)" : mk.vix < 15 ? "(ตลาดนิ่ง)" : ""}
- Beta ของตัวนี้เทียบ S&P 500: ${data.beta ?? "N/A"} ${data.beta > 1.3 ? "(แกว่งแรงกว่าตลาด)" : data.beta != null && data.beta < 0.7 ? "(แกว่งน้อยกว่าตลาด)" : ""}` : "";

  const earningsSection = data.earnings
    ? `\nวันประกาศงบถัดไป: ${data.earnings.date} (อีก ${data.earnings.daysUntil} วัน)${data.earnings.daysUntil <= 14 ? " ⚠ อยู่ในช่วงถือของ swing trade ราคาอาจกระโดดแรง" : ""}`
    : "";

  const pj = data.projection;
  const projectionSection = pj ? `
กรวยแนวโน้มเชิงสถิติ ${pj.horizon} วันทำการ (ความผันผวน ${pj.sigmaDaily}%/วัน):
- กรณีกลาง: $${pj.points[pj.points.length - 1].p50} | ช่วง 50%: $${pj.points[pj.points.length - 1].p25}–$${pj.points[pj.points.length - 1].p75} | ช่วง 80%: $${pj.points[pj.points.length - 1].p10}–$${pj.points[pj.points.length - 1].p90}` : "";

  const pos = data.position;
  const positionSection = pos ? `
ผู้ใช้ถือตัวนี้อยู่:
- ต้นทุนเฉลี่ย $${pos.avgCost.toFixed(2)} จำนวน ${pos.qty} หน่วย (ซื้อครั้งแรก ${pos.firstBought})
- กำไร/ขาดทุนตอนนี้: ${(((data.price - pos.avgCost) / pos.avgCost) * 100).toFixed(2)}%` : "";

  const [acc, cal] = await Promise.all([getLatestAccuracy(), getCalibration()]);
  const lessons: string[] = [];
  if (acc && acc.overall.evaluated >= 3) {
    lessons.push(`คำแนะนำ "Buy" ที่ผ่านมาถูก ${acc.buy.winRate ?? "?"}% (${acc.buy.evaluated} ครั้ง), ผลตอบแทนเฉลี่ย 14 วัน ${acc.buy.avgRet14 ?? "?"}%, ชน TP1 ${acc.buy.tpHits} ครั้ง ชน SL ${acc.buy.slHits} ครั้ง`);
    if (acc.buyHighScore.evaluated && acc.buyLowScore.evaluated) lessons.push(`เมื่อให้คะแนน ≥7 ถูก ${acc.buyHighScore.winRate}% เทียบกับคะแนน <7 ถูก ${acc.buyLowScore.winRate}%`);
    const mine = acc.bySymbol?.[String(data.symbol).toUpperCase()];
    if (mine?.length) lessons.push(`ประวัติคำแนะนำตัวนี้: ${mine.map((o) => `${o.date} ${o.suggestion}${o.score ? `(${o.score})` : ""} → 14 วัน ${o.ret14 ?? "รอ"}%${o.hit ? ` ชน ${o.hit.toUpperCase()}` : ""}`).join("; ")}`);
  }
  if (cal?.stats) {
    const ranked = Object.entries(cal.stats).filter(([, v]) => v && v.count >= 60).sort((a, b) => b[1]!.edge - a[1]!.edge);
    const fmtSig = ([k, v]: (typeof ranked)[number]) => `${k} (ถูก ${v!.hitRate}%, edge ${v!.edge > 0 ? "+" : ""}${v!.edge}%)`;
    lessons.push(`ทดสอบย้อนหลัง ${cal.samples.toLocaleString()} จุด (${cal.symbols} ตัว, ${cal.horizonDays} วันข้างหน้า): สัญญาณที่เชื่อได้มากสุด ${ranked.slice(0, 3).map(fmtSig).join(", ")} | เชื่อได้น้อยสุด ${ranked.slice(-3).map(fmtSig).join(", ")}`);
  }
  // This symbol's own track record for chart arrows (trend flips / score crossings) over the past year.
  const done = (data.markers ?? []).filter((m: { fwd10: number | null }) => m.fwd10 != null) as { kind: string; dir: number; fwd10: number }[];
  for (const kind of ["trend", "score"]) {
    const ms = done.filter((m) => m.kind === kind);
    if (ms.length >= 3) {
      const right = ms.filter((m) => m.dir * m.fwd10 > 0).length;
      lessons.push(`สัญญาณ${kind === "trend" ? "เปลี่ยนเทรนด์ (Supertrend)" : "คะแนนรวมข้าม ±3"}ของตัวนี้ในรอบ 1 ปี ถูก ${right}/${ms.length} ครั้ง (${Math.round((right / ms.length) * 100)}%)${right / ms.length < 0.45 ? " → ตัวนี้สัญญาณหลอกบ่อย ลดความมั่นใจ" : right / ms.length > 0.6 ? " → สัญญาณตัวนี้ค่อนข้างเชื่อได้" : ""}`);
    }
  }

  const lessonSection = lessons.length ? `
บทเรียนจากผลจริงที่ผ่านมา (ใช้ปรับความมั่นใจ ถ้าคำแนะนำคล้ายแบบที่เคยผิดบ่อย ให้ลดคะแนนและบอกเหตุผล):
${lessons.map((l) => `- ${l}`).join("\n")}` : "";

  let prevSection = "";
  try {
    const prev = await sql`
      SELECT created_at, result FROM analysis_cache
      WHERE symbol = ${String(data.symbol).toUpperCase()} AND type = 'symbol'
      ORDER BY created_at DESC LIMIT 1`;
    if (prev.length) {
      const r = prev[0].result as Record<string, unknown> & { targets?: { tp1?: unknown }; entryStrategy?: { first?: unknown } };
      const days = Math.max(0, Math.round((Date.now() - new Date(prev[0].created_at).getTime()) / 86400000));
      const why = String(r.technicalDetail ?? r.summary ?? "").slice(0, 350);
      prevSection = `
การวิเคราะห์ครั้งก่อนของตัวนี้ (${days === 0 ? "วันนี้" : `${days} วันก่อน`}${r.priceAtAnalysis ? `, ราคาตอนนั้น $${r.priceAtAnalysis}` : ""}):
- แนะนำ ${r.suggestion} คะแนน ${r.score} | จุดเข้า $${r.entryStrategy?.first ?? "?"} | TP1 $${r.targets?.tp1 ?? "?"} | SL $${r.stopLoss ?? "?"}
- สรุป: ${String(r.tldr ?? "").slice(0, 200)}
- เหตุผล: ${why}
ให้คำแนะนำต่อเนื่องจากครั้งก่อน ถ้าเปลี่ยนความเห็นต้องบอกว่าอะไรเปลี่ยนไป (ราคา สัญญาณ หรือข่าว) อย่ากลับไปกลับมาโดยไม่มีเหตุผล`;
    }
  } catch {}

  const atrOdds = ind?.atr && data.projection
    ? tradeOdds(data.price, data.price + 2 * ind.atr, data.price - 1.5 * ind.atr, data.projection.muDaily, data.projection.sigmaDaily)
    : null;
  const oddsSection = atrOdds ? `
จำลองราคา 2,000 เส้นทาง 10 วันทำการ จากความผันผวนจริงของตัวนี้: ถ้าเข้าที่ราคาปัจจุบัน ตั้ง TP = +2×ATR ($${(data.price + 2 * ind.atr).toFixed(2)}) และ SL = −1.5×ATR ($${(data.price - 1.5 * ind.atr).toFixed(2)})
→ โอกาสชน TP ก่อน ${atrOdds.pTarget}% | ชน SL ก่อน ${atrOdds.pStop}% | ยังไม่ชนทั้งคู่ ${atrOdds.pOpen}% | ผลตอบแทนคาดหวัง ${atrOdds.expectedPct}%
ใช้ตัวเลขนี้ประกอบการให้คะแนน: ถ้าโอกาสชน TP ต่ำกว่าชน SL ไม่ควรให้คะแนนสูง` : "";

  const sc = data.sector;
  const sectorSection = sc ? `
เทียบกับ${sc.label} (${sc.etf}):
- 20 วัน: ตัวนี้ ${sc.stockPerf20d}% vs กลุ่ม ${sc.sectorPerf20d}% → ${sc.rs20 > 0 ? "แข็งกว่ากลุ่ม" : "อ่อนกว่ากลุ่ม"} ${sc.rs20}%
- 60 วัน: ตัวนี้ ${sc.stockPerf60d}% vs กลุ่ม ${sc.sectorPerf60d}% → ${sc.rs60 > 0 ? "แข็งกว่ากลุ่ม" : "อ่อนกว่ากลุ่ม"} ${sc.rs60}%` : "";

  const confluenceSection = ind?.confluence ? `
Confluence Score: ${ind.confluence.score}/7 (${ind.confluence.signal.replace("_", " ").toUpperCase()})
- Signals: ${ind.confluence.details.join(" | ") || "none"}` : "";

  const weeklySection = ind?.weekly ? `
Weekly Timeframe:
- Weekly Trend: ${ind.weekly.trend.toUpperCase()} ${ind.weekly.rsi ? `| Weekly RSI: ${ind.weekly.rsi}` : ""}
- Weekly Volume: ${ind.weekly.volRatio ? `${ind.weekly.volRatio}x avg` : "N/A"}` : "";

  const trendStrengthSection = ind ? `
Trend Strength:
- ADX: ${ind.adx ?? "N/A"} (${ind.trendStrength}) ${ind.adx && ind.adx >= 25 ? "— trend แข็งแกร่ง" : ind.adx ? "— trend อ่อน/sideways" : ""}
- EMA20 Slope: ${ind.ema20Slope > 0.5 ? `+${ind.ema20Slope}% (ขาขึ้น)` : ind.ema20Slope < -0.5 ? `${ind.ema20Slope}% (ขาลง)` : `${ind.ema20Slope}% (flat)`}` : "";

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
- RSI(14): ${ind?.rsi} (${ind?.rsiDirection}) ${ind?.rsi > 70 ? "⚠ Overbought" : ind?.rsi < 30 ? "✓ Oversold" : "Neutral"}
- MACD: Line ${ind?.macd?.macd?.toFixed(4)} | Signal ${ind?.macd?.signal?.toFixed(4)} | Histogram ${ind?.macd?.histogram?.toFixed(4)} ${ind?.macd?.histogram > 0 ? "(Bullish)" : "(Bearish)"}
- Bollinger Bands: Upper $${ind?.bb?.upper?.toFixed(2)} | Middle $${ind?.bb?.middle?.toFixed(2)} | Lower $${ind?.bb?.lower?.toFixed(2)} | Width ${ind?.bb?.width}%
- MA20: $${ind?.ma20?.toFixed(2)} | MA50: $${ind?.ma50?.toFixed(2) ?? "N/A"} | MA100: $${ind?.ma100?.toFixed(2) ?? "N/A"} | MA200: $${ind?.ma200?.toFixed(2) ?? "N/A"}
- ราคาเทียบ MA: ${data.price > ind?.ma20 ? "เหนือ MA20 ✓" : "ใต้ MA20 ✗"} ${ind?.ma50 ? data.price > ind.ma50 ? "| เหนือ MA50 ✓" : "| ใต้ MA50 ✗" : ""} ${ind?.ma200 ? data.price > ind.ma200 ? "| เหนือ MA200 ✓ (Bull market)" : "| ใต้ MA200 ✗ (Bear market)" : ""}
- แนวรับ (Swing Low): $${ind?.support?.map((s: number) => s.toFixed(2)).join(", ")}
- แนวต้าน (Swing High): $${ind?.resistance?.map((r: number) => r.toFixed(2)).join(", ")}
${volumeSection}${flowSection}${trendStrengthSection}${weeklySection}${confluenceSection}${marketSection}${sectorSection}${earningsSection}${projectionSection}${positionSection}${prevSection}${oddsSection}${lessonSection}${analystSection}${fearGreedSection}${newsSection}

วิเคราะห์ครบทุกมิติ แล้วตอบเป็น JSON เท่านั้น (ห้ามมีข้อความนอก JSON) ฟิลด์ราคาและตัวเลขทุกตัวต้องเป็น number ล้วน ห้ามใส่ $ หรือช่วงราคา:
{
  "tldr": "สรุปสั้น 1-2 ประโยค สำหรับคนไม่อยากอ่านยาว บอกว่าตอนนี้ควรทำอะไร",
  "oneLiner": "ประโยคเดียวไม่เกิน 15 คำ ภาษาพูดง่ายๆ ว่าควรทำอะไรตอนนี้ พร้อมราคา เช่น รอให้ลงมา $226 ค่อยซื้อ",
  "confidenceNote": "1 ประโยค บอกว่ามั่นใจแค่ไหนและทำไม อ้างอิงบทเรียนจากผลที่ผ่านมาถ้ามี",
  "changeFromLast": "1 ประโยค เทียบกับการวิเคราะห์ครั้งก่อน อะไรเปลี่ยนไปและคำแนะนำเปลี่ยนหรือไม่ (ถ้าไม่มีครั้งก่อนให้เป็น null)",
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
  "exitStrategy": "กลยุทธ์การออก 1-2 ประโยค เช่น ขายครึ่งที่ TP1 แล้วย้าย stop loss มาที่ entry"${pos ? `,
  "positionAdvice": {
    "action": "Hold" | "TakeProfit" | "CutLoss" | "AddMore",
    "actionTH": "ถือต่อ" | "ขายทำกำไรบางส่วน" | "ตัดขาดทุน" | "ซื้อเพิ่ม",
    "reason": "เหตุผล 2-3 ประโยค อิงจากต้นทุนของผู้ใช้ ไม่ใช่แค่ราคาตลาด",
    "stopForPosition": ราคา stop loss ที่เหมาะกับต้นทุนนี้ (number),
    "targetForPosition": ราคาเป้าหมายที่ควรขาย (number)
  }` : ""}
}`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        reasoning_effort: "low",
        max_tokens: 6000,
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
    const num = (v: unknown) => {
      if (typeof v === "number") return v;
      const m = String(v ?? "").replace(/,/g, "").match(/-?\d+(\.\d+)?/);
      return m ? Number(m[0]) : null;
    };
    analysis.stopLoss = num(analysis.stopLoss);
    analysis.riskReward = num(analysis.riskReward);
    analysis.score = num(analysis.score);
    if (analysis.targets) { analysis.targets.tp1 = num(analysis.targets.tp1); analysis.targets.tp2 = num(analysis.targets.tp2); }
    analysis.priceAtAnalysis = data.price;
    {
      const entry = num(analysis.entryStrategy?.first) ?? data.price;
      const tp = num(analysis.targets?.tp1), sl = num(analysis.stopLoss);
      if (tp && sl && data.projection) analysis.odds = tradeOdds(entry, tp, sl, data.projection.muDaily, data.projection.sigmaDaily);
    }
    if (analysis.positionAdvice) {
      analysis.positionAdvice.stopForPosition = num(analysis.positionAdvice.stopForPosition);
      analysis.positionAdvice.targetForPosition = num(analysis.positionAdvice.targetForPosition);
    }
    if (analysis.entryStrategy) { analysis.entryStrategy.first = num(analysis.entryStrategy.first); analysis.entryStrategy.second = num(analysis.entryStrategy.second); }

    // บันทึกลง DB โดยไม่ block response
    initDB().then(() =>
      sql`INSERT INTO analysis_cache (symbol, type, result)
          VALUES (${data.symbol.toUpperCase()}, 'symbol', ${JSON.stringify(analysis)}::jsonb)`
    ).catch(() => {});

    return NextResponse.json(analysis);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Analysis failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
