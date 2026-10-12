import { NextRequest, NextResponse } from "next/server";

interface Msg { role: "user" | "assistant"; content: string }

export async function POST(req: NextRequest) {
  const { context, messages } = (await req.json()) as { context: Record<string, unknown>; messages: Msg[] };
  const history = (messages ?? []).filter((m) => m && typeof m.content === "string").slice(-10)
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content.slice(0, 2000) }));
  if (!history.length) return NextResponse.json({ error: "ไม่มีคำถาม" }, { status: 400 });

  const system = `คุณคือผู้ช่วยวิเคราะห์หุ้นและ crypto ภาษาไทยสำหรับ swing trader มือใหม่
ตอบสั้น กระชับ ภาษาพูดง่ายๆ (ไม่เกิน 6 บรรทัด) ห้ามแต่งตัวเลขใหม่ที่ไม่มีในข้อมูล
คำถามแบบ "ถ้าราคาไปถึง X" ให้ตอบโดยเทียบ X กับ stop loss, แนวรับ/แนวต้าน, TP และต้นทุนของผู้ใช้ที่มีในข้อมูล แล้วบอกสิ่งที่ควรทำชัดๆ
กฎสำคัญ: ถ้า X ต่ำกว่า stop loss แปลว่าตามแผนควรขายตัดขาดทุนไปแล้วตอนแตะ stop loss ห้ามแนะนำให้ย้าย stop ลงไปต่ำกว่าเดิม ถ้า X สูงกว่า TP ให้แนะนำขายทำกำไรตามแผน
บอกว่าไม่มีข้อมูลเฉพาะเมื่อไม่มีตัวเลขที่เกี่ยวข้องเลยจริงๆ ถ้าเป็นการตัดสินใจลงทุน ให้ระบุความเสี่ยงสั้นๆ ด้วย
อธิบายศัพท์เทคนิคเป็นภาษาบ้านๆ เสมอ
ห้ามพูดถึงชื่อฟิลด์ JSON (เช่น analysis, positionAdvice) ให้พูดว่า "ผลวิเคราะห์ล่าสุด" หรือ "คำแนะนำสำหรับพอร์ตของคุณ" แทน และไม่ต้องใช้ markdown

ข้อมูลปัจจุบัน (JSON):
${JSON.stringify(context).slice(0, 12000)}`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        reasoning_effort: "low",
        max_tokens: 2500,
        temperature: 0.4,
        messages: [{ role: "system", content: system }, ...history],
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const j = await res.json();
    const reply = (j.choices?.[0]?.message?.content ?? "").trim();
    return NextResponse.json({ reply: reply || "ขอโทษครับ ตอบไม่ได้ ลองถามใหม่อีกครั้ง" });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Chat failed" }, { status: 500 });
  }
}
