import { appIcon } from "@/lib/appIcon";

const SIZES: Record<string, [number, boolean]> = { "192": [192, false], "512": [512, false], "maskable-512": [512, true] };

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const spec = SIZES[(await params).size];
  if (!spec) return new Response("Not found", { status: 404 });
  return appIcon(spec[0], spec[1]);
}
