import { NextResponse } from "next/server";
import {
  type MastersLookupResult,
  lookupCuratedBook,
  normalizeFenKey,
  parseLichessMastersPayload,
} from "@/lib/openings";

const cache = new Map<string, MastersLookupResult>();
const MAX_CACHE = 500;

async function resolveMasters(fen: string): Promise<MastersLookupResult> {
  const key = normalizeFenKey(fen);
  const cached = cache.get(key);
  if (cached) return cached;

  const fallback = lookupCuratedBook(fen) ?? {
    eco: null,
    openingName: null,
    totalMasterGames: 0,
    topGames: [],
    source: "book" as const,
  };

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (process.env.LICHESS_API_TOKEN) {
      headers.Authorization = `Bearer ${process.env.LICHESS_API_TOKEN}`;
    }
    const url = `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(fen)}&topGames=3`;
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(1200),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const parsed = parseLichessMastersPayload(data, fen);
    if (cache.size >= MAX_CACHE) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(key, parsed);
    return parsed;
  } catch {
    return fallback;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { fen?: string };
    const fen = body.fen?.trim();
    if (!fen) {
      return NextResponse.json({ error: "Missing fen" }, { status: 400 });
    }
    const result = await resolveMasters(fen);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
