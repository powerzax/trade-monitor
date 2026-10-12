import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL!);

export async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS favorites (
      id SERIAL PRIMARY KEY,
      symbol TEXT NOT NULL UNIQUE,
      crypto BOOLEAN NOT NULL DEFAULT false,
      name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS analysis_cache (
      id SERIAL PRIMARY KEY,
      result JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Migrate: add columns if they don't exist (safe on re-run)
  await sql`ALTER TABLE analysis_cache ADD COLUMN IF NOT EXISTS symbol TEXT NOT NULL DEFAULT 'market_overview'`;
  await sql`ALTER TABLE analysis_cache ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'symbol'`;
  await sql`
    CREATE TABLE IF NOT EXISTS positions (
      id SERIAL PRIMARY KEY,
      symbol TEXT NOT NULL,
      crypto BOOLEAN NOT NULL DEFAULT false,
      name TEXT,
      price NUMERIC NOT NULL,
      qty NUMERIC NOT NULL,
      bought_at DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_analysis_cache_symbol
    ON analysis_cache(symbol, created_at DESC)
  `;
}
