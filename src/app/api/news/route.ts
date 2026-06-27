import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") ?? "";
  const base = symbol.replace(/-USD$/, "");

  try {
    // Yahoo Finance RSS — กรองข่าวตาม symbol
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${base}&region=US&lang=en-US`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 600 },
    });
    if (!res.ok) throw new Error("RSS fetch failed");
    const xml = await res.text();

    // Parse RSS items
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8).map((m) => {
      const item = m[1];
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ?? item.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
      const link = item.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";
      const description = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] ?? item.match(/<description>(.*?)<\/description>/)?.[1] ?? "";
      const cleanDesc = description.replace(/<[^>]+>/g, "").trim().slice(0, 200);
      return { title, link, pubDate, description: cleanDesc };
    });

    return NextResponse.json({ items });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg, items: [] }, { status: 500 });
  }
}
