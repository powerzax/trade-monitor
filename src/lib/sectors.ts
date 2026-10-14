export const SECTOR_TH: Record<string, string> = {
  Technology: "เทคโนโลยี",
  "Communication Services": "สื่อสาร/อินเทอร์เน็ต",
  "Consumer Cyclical": "สินค้าฟุ่มเฟือย",
  "Consumer Defensive": "สินค้าจำเป็น",
  Energy: "พลังงาน",
  "Financial Services": "การเงิน",
  Healthcare: "สุขภาพ",
  Industrials: "อุตสาหกรรม",
  "Basic Materials": "วัตถุดิบ",
  "Real Estate": "อสังหาฯ",
  Utilities: "สาธารณูปโภค",
  Crypto: "Crypto",
};

export const sectorLabel = (sector: string | null | undefined) => (sector ? SECTOR_TH[sector] ?? sector : "ไม่ทราบกลุ่ม");
