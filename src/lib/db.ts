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
      type TEXT NOT NULL DEFAULT 'market_overview',
      result JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}
