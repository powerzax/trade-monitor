export interface Position {
  id: number;
  symbol: string;
  crypto: boolean;
  name: string | null;
  price: number;
  qty: number;
  side: "buy" | "sell";
  bought_at: string;
  ai_suggestion?: string | null;
  ai_action?: string | null;
  ai_action_th?: string | null;
}

export interface Sale extends Position {
  avgCostAtSale: number;
  realized: number;
  realizedPct: number;
}

export interface Holding {
  symbol: string;
  crypto: boolean;
  name: string | null;
  qty: number;
  cost: number;
  avgCost: number;
  firstBought: string;
  realized: number;
  lots: Position[];
  sales: Sale[];
}

// Average-cost method: a sale books (price - running average cost) × qty as realized P&L.
export function computeHoldings(positions: Position[]) {
  const sorted = [...positions].sort((a, b) => a.bought_at.localeCompare(b.bought_at) || a.id - b.id);
  const map = new Map<string, Holding>();
  for (const p of sorted) {
    const h = map.get(p.symbol) ?? { symbol: p.symbol, crypto: p.crypto, name: p.name, qty: 0, cost: 0, avgCost: 0, firstBought: p.bought_at, realized: 0, lots: [], sales: [] };
    h.lots.push(p);
    if (p.side === "sell") {
      const avg = h.qty > 0 ? h.cost / h.qty : 0;
      const q = Math.min(p.qty, h.qty);
      const realized = (p.price - avg) * q;
      h.realized += realized;
      h.sales.push({ ...p, avgCostAtSale: avg, realized, realizedPct: avg ? ((p.price - avg) / avg) * 100 : 0 });
      h.cost -= avg * q;
      h.qty -= q;
      if (h.qty < 1e-9) { h.qty = 0; h.cost = 0; }
    } else {
      if (h.qty === 0) h.firstBought = p.bought_at;
      h.qty += p.qty;
      h.cost += p.qty * p.price;
    }
    map.set(p.symbol, h);
  }
  const all = [...map.values()].map((h) => ({ ...h, avgCost: h.qty > 0 ? h.cost / h.qty : 0 }));
  return {
    open: all.filter((h) => h.qty > 0),
    realizedTotal: all.reduce((a, h) => a + h.realized, 0),
    sales: all.flatMap((h) => h.sales).sort((a, b) => b.bought_at.localeCompare(a.bought_at) || b.id - a.id),
  };
}
