import { GAMMA_API, WORLD_CUP_SEARCH_QUERIES } from "../config.js";
import type { EventGroup, MarketInfo } from "../types.js";

interface GammaEvent {
  id: string;
  title: string;
  slug: string;
  negRisk?: boolean;
  liquidity?: number;
  volume24hr?: number;
  active?: boolean;
  closed?: boolean;
  markets?: GammaMarket[];
}

interface GammaMarket {
  id: string;
  question: string;
  slug: string;
  outcomes?: string;
  outcomePrices?: string;
  clobTokenIds?: string;
  enableOrderBook?: boolean;
  liquidity?: number;
  volume24hr?: number;
  groupItemTitle?: string;
  active?: boolean;
  closed?: boolean;
}

function parseJsonArray<T>(value: string | undefined, fallback: T[]): T[] {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T[];
  } catch {
    return fallback;
  }
}

function toMarketInfo(event: GammaEvent, market: GammaMarket): MarketInfo {
  const outcomes = parseJsonArray<string>(market.outcomes, []);
  const outcomePrices = parseJsonArray<string>(market.outcomePrices, []).map(Number);
  const clobTokenIds = parseJsonArray<string>(market.clobTokenIds, []);

  return {
    id: market.id,
    eventId: event.id,
    eventTitle: event.title,
    question: market.question,
    groupItemTitle: market.groupItemTitle ?? null,
    slug: market.slug,
    outcomes,
    outcomePrices,
    clobTokenIds,
    enableOrderBook: Boolean(market.enableOrderBook),
    liquidity: market.liquidity ?? 0,
    volume24hr: market.volume24hr ?? 0,
    negRisk: Boolean(event.negRisk),
    active: market.active !== false,
    closed: market.closed === true,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Gamma API error ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

function isWorldCupRelated(title: string, description = ""): boolean {
  const text = `${title} ${description}`.toLowerCase();
  return (
    text.includes("world cup") ||
    text.includes("fifa") ||
    text.includes("2026")
  );
}

export async function searchWorldCupEvents(): Promise<GammaEvent[]> {
  const seen = new Map<string, GammaEvent>();

  for (const query of WORLD_CUP_SEARCH_QUERIES) {
    const url = `${GAMMA_API}/public-search?q=${encodeURIComponent(query)}&limit_per_type=20`;
    const data = await fetchJson<{ events?: GammaEvent[] }>(url);

    for (const event of data.events ?? []) {
      if (!event.id || seen.has(event.id)) continue;
      if (!isWorldCupRelated(event.title)) continue;
      if (event.closed) continue;
      seen.set(event.id, event);
    }
  }

  const events = [...seen.values()];
  const enriched: GammaEvent[] = [];

  for (const event of events) {
    try {
      const full = await fetchJson<GammaEvent>(`${GAMMA_API}/events/${event.id}`);
      enriched.push(full);
    } catch {
      enriched.push(event);
    }
  }

  return enriched.sort((a, b) => (b.volume24hr ?? 0) - (a.volume24hr ?? 0));
}

export function groupEvents(events: GammaEvent[], minLiquidityUsd: number, maxMarkets: number): EventGroup[] {
  const groups: EventGroup[] = [];

  for (const event of events) {
    const markets = (event.markets ?? [])
      .filter((market) => market.enableOrderBook && market.active !== false && market.closed !== true)
      .map((market) => toMarketInfo(event, market))
      .filter((market) => market.clobTokenIds.length >= 2 && market.liquidity >= minLiquidityUsd)
      .slice(0, maxMarkets);

    if (markets.length === 0) continue;

    groups.push({
      id: event.id,
      title: event.title,
      slug: event.slug,
      negRisk: Boolean(event.negRisk),
      liquidity: event.liquidity ?? 0,
      volume24hr: event.volume24hr ?? 0,
      markets,
    });
  }

  return groups;
}

export async function discoverWorldCupMarkets(
  minLiquidityUsd: number,
  maxMarkets: number,
): Promise<EventGroup[]> {
  const events = await searchWorldCupEvents();
  return groupEvents(events, minLiquidityUsd, maxMarkets);
}
