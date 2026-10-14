export const SETUPS = {
  pullback_uptrend: { th: "ย่อตัวในขาขึ้น", hint: "เทรนด์หลักขึ้น ราคาย่อลงมาหาแนวรับหรือเส้นค่าเฉลี่ย" },
  breakout: { th: "ทะลุแนวต้าน", hint: "ราคาเพิ่งทะลุแนวต้านหรือจุดสูงเดิม มักมี volume หนุน" },
  oversold_bounce: { th: "เด้งจากจุดขายมากเกิน", hint: "ลงมาแรงจน RSI/MFI ต่ำมาก มีโอกาสเด้งระยะสั้น" },
  range_support: { th: "แกว่งในกรอบ ใกล้แนวรับ", hint: "ไม่มีเทรนด์ชัด ราคาแกว่งในกรอบและอยู่ใกล้ขอบล่าง" },
  downtrend: { th: "ขาลง", hint: "เทรนด์หลักลง ราคาอยู่ใต้เส้นค่าเฉลี่ยและทำจุดต่ำใหม่" },
  unclear: { th: "ยังไม่ชัด", hint: "สัญญาณขัดกันหรือไม่เข้ารูปแบบใด" },
} as const;

export type SetupKey = keyof typeof SETUPS;
export const SETUP_KEYS = Object.keys(SETUPS) as SetupKey[];

export function normalizeSetup(v: unknown): SetupKey {
  const k = String(v ?? "").trim().toLowerCase();
  return (SETUP_KEYS as string[]).includes(k) ? (k as SetupKey) : "unclear";
}
