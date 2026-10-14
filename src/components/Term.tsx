import type { ReactNode } from "react";

type Explain = { what: string; now?: (v: number) => string };

const GLOSSARY: Record<string, Explain> = {
  rsi: {
    what: "RSI วัดว่าช่วงนี้ราคาขึ้นหรือลงแรงแค่ไหน (0–100)",
    now: (v) => v >= 70 ? `${v.toFixed(0)} = ขึ้นมาเร็วเกินไป มีโอกาสพักตัว` : v <= 30 ? `${v.toFixed(0)} = ลงมาแรงเกินไป มีโอกาสเด้งกลับ` : v >= 55 ? `${v.toFixed(0)} = แรงซื้อเริ่มนำ แต่ยังไม่ร้อนเกิน` : v <= 45 ? `${v.toFixed(0)} = แรงขายเริ่มนำ แต่ยังไม่ถูกเกิน` : `${v.toFixed(0)} = กลางๆ ยังไม่มีฝั่งไหนชนะ`,
  },
  macd: {
    what: "MACD ดูว่าแรงส่งของราคากำลังเร่งขึ้นหรือแผ่วลง",
    now: (v) => v > 0 ? "เป็นบวก = แรงส่งขาขึ้นยังอยู่" : "เป็นลบ = แรงส่งขาลงยังอยู่",
  },
  bb: { what: "Bollinger Bands คือกรอบความแกว่งปกติของราคา ชนขอบบนบ่อยแปลว่าร้อน ชนขอบล่างแปลว่าถูกขายหนัก" },
  ma: { what: "MA คือราคาเฉลี่ยย้อนหลัง ราคาอยู่เหนือเส้น = แนวโน้มขึ้น อยู่ใต้เส้น = แนวโน้มลง MA20 ดูระยะสั้น MA50 ดูระยะกลาง" },
  volume: {
    what: "Volume Ratio เทียบปริมาณซื้อขายวันนี้กับค่าเฉลี่ย 20 วัน",
    now: (v) => v >= 1.5 ? `${v}x = คนแห่ซื้อขายผิดปกติ มักมีข่าวหรือเงินใหญ่เข้า` : v <= 0.7 ? `${v}x = เงียบ คนยังไม่สนใจ การขยับของราคาอาจไม่หนักแน่น` : `${v}x = ปกติ`,
  },
  beta: {
    what: "Beta บอกว่าหุ้นแกว่งแรงแค่ไหนเมื่อเทียบกับตลาด (S&P 500 = 1)",
    now: (v) => `${v} = ถ้าตลาดขึ้นหรือลง 1% ตัวนี้มักขยับราว ${v.toFixed(1)}%`,
  },
  adx: {
    what: "ADX วัดความแรงของเทรนด์ ไม่บอกทิศทาง",
    now: (v) => v >= 25 ? `${v} = มีเทรนด์ชัด สัญญาณตามเทรนด์เชื่อถือได้ขึ้น` : `${v} = ไม่มีเทรนด์ชัด ราคามักแกว่งในกรอบ`,
  },
  vix: {
    what: "VIX คือดัชนีความกลัวของตลาด US",
    now: (v) => v >= 25 ? `${v} = ตลาดกลัวสูง ราคาแกว่งแรง` : v <= 15 ? `${v} = ตลาดสบายใจ ความผันผวนต่ำ` : `${v} = ปกติ`,
  },
  confluence: { what: "Confluence Score รวมสัญญาณทางเทคนิคทุกตัวเป็นคะแนนเดียว (-7 ถึง +7) แต่ละสัญญาณถ่วงน้ำหนักตามที่ทดสอบย้อนหลังแล้วว่าแม่นแค่ไหน ยิ่งบวกมากยิ่งเอียงไปทางซื้อ" },
  weekly: { what: "เทรนด์รายสัปดาห์คือภาพใหญ่ ถ้ารายวันกับรายสัปดาห์ไปทางเดียวกัน สัญญาณจะหนักแน่นกว่า" },
  sector: {
    what: "เทียบผลตอบแทนกับกลุ่มอุตสาหกรรมเดียวกัน หุ้นที่แข็งกว่ากลุ่มมักไปต่อได้ดีกว่า",
    now: (v) => v > 0 ? `แข็งกว่ากลุ่ม ${v}% = มีเงินไหลเข้าตัวนี้มากกว่าเพื่อน` : `อ่อนกว่ากลุ่ม ${Math.abs(v)}% = นักลงทุนเลือกตัวอื่นในกลุ่มมากกว่า`,
  },
  drawdown: {
    what: "เคยลงหนักสุด = ตั้งแต่เริ่มเก็บข้อมูล พอร์ตเคยลดลงจากจุดที่ดีที่สุดมากที่สุดกี่ % คิดจากผลตอบแทน ไม่ใช่มูลค่า การซื้อเพิ่มหรือขายออกจึงไม่ทำให้ตัวเลขเพี้ยน",
    now: (v) => v <= 7 ? `${v}% = พอร์ตค่อนข้างนิ่ง` : v <= 15 ? `${v}% = มีช่วงที่ลงพอสมควร` : `${v}% = เคยลงหนัก ควรดูว่าถือหุ้นเสี่ยงกระจุกเกินไปไหม`,
  },
  setup: { what: "รูปแบบสถานการณ์คือกลุ่มของจังหวะราคาที่คล้ายกัน เช่น ย่อตัวในขาขึ้น หรือทะลุแนวต้าน ระบบเก็บสถิติแยกตามรูปแบบ เพื่อดูว่า AI แม่นกับสถานการณ์แบบไหน" },
  projection: { what: "กรวยแนวโน้มคือช่วงราคาที่น่าจะเป็นใน 10 วันทำการ คำนวณจากความผันผวนจริง ไม่ใช่การทำนายแน่นอน ช่วง 80% แปลว่าราคามีโอกาสราว 8 ใน 10 ที่จะอยู่ในกรอบนี้" },
};

export function Term({ id, value, children }: { id: keyof typeof GLOSSARY | string; value?: number | null; children: ReactNode }) {
  const g = GLOSSARY[id];
  if (!g) return <>{children}</>;
  return (
    <span tabIndex={0} className="group relative inline-flex cursor-help items-center gap-1 outline-none">
      <span className="border-b border-dotted border-slate-500/70">{children}</span>
      <span className="text-[10px] text-slate-500 group-hover:text-violet-300">ⓘ</span>
      <span className="pointer-events-none invisible fixed inset-x-4 bottom-24 z-50 sm:absolute sm:inset-x-auto sm:bottom-full sm:left-0 sm:mb-2 sm:w-64 rounded-xl border border-violet-400/30 bg-[#15122b] p-3 text-left text-xs font-normal normal-case tracking-normal text-slate-200 opacity-0 shadow-2xl shadow-black/50 backdrop-blur-xl transition group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100">
        <span className="block">{g.what}</span>
        {g.now && value != null && Number.isFinite(value) && <span className="mt-1.5 block font-medium text-violet-200">ตอนนี้: {g.now(value)}</span>}
      </span>
    </span>
  );
}
