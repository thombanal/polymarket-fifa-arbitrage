import type {
  ArbitrageOpportunity,
  ArbitrageSettings,
  EventGroup,
  MarketStateRow,
  TradeExecution,
} from "../types.js";
import { closeRedisClient, getRedisClient, isRedisEnabled } from "./client.js";

const KEY_PREFIX = process.env.REDIS_KEY_PREFIX?.trim() || "workdcup:";

function parseIntOrDefault(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

const MARKETS_TTL_SEC = parseIntOrDefault(process.env.REDIS_MARKETS_TTL_SEC, 300);
const STATE_TTL_SEC = parseIntOrDefault(process.env.REDIS_STATE_TTL_SEC, 120);

const keys = {
  settings: `${KEY_PREFIX}settings`,
  stats: `${KEY_PREFIX}stats`,
  marketState: `${KEY_PREFIX}market-state`,
  opportunities: `${KEY_PREFIX}opportunities`,
  markets: (minLiquidityUsd: number, maxMarkets: number) =>
    `${KEY_PREFIX}markets:${minLiquidityUsd}:${maxMarkets}`,
};

export interface BotStats {
  scanCount: number;
  opportunitiesFound: number;
  tradesExecuted: number;
  totalSimulatedProfit: number;
  updatedAt: string;
}

async function withRedis<T>(operation: () => Promise<T>): Promise<T | null> {
  if (!isRedisEnabled()) {
    return null;
  }

  try {
    const client = getRedisClient();
    if (client.status !== "ready") {
      await client.connect();
    }
    return await operation();
  } catch {
    return null;
  }
}

export async function loadSettingsFromRedis(): Promise<ArbitrageSettings | null> {
  return withRedis(async () => {
    const raw = await getRedisClient().get(keys.settings);
    if (!raw) return null;
    return JSON.parse(raw) as ArbitrageSettings;
  });
}

export async function saveSettingsToRedis(settings: ArbitrageSettings): Promise<boolean> {
  const result = await withRedis(async () => {
    await getRedisClient().set(keys.settings, JSON.stringify(settings));
    return true;
  });
  return result === true;
}

export async function loadMarketsFromRedis(
  minLiquidityUsd: number,
  maxMarkets: number,
): Promise<EventGroup[] | null> {
  return withRedis(async () => {
    const raw = await getRedisClient().get(keys.markets(minLiquidityUsd, maxMarkets));
    if (!raw) return null;
    return JSON.parse(raw) as EventGroup[];
  });
}

export async function saveMarketsToRedis(
  minLiquidityUsd: number,
  maxMarkets: number,
  groups: EventGroup[],
): Promise<boolean> {
  const result = await withRedis(async () => {
    await getRedisClient().set(
      keys.markets(minLiquidityUsd, maxMarkets),
      JSON.stringify(groups),
      "EX",
      MARKETS_TTL_SEC,
    );
    return true;
  });
  return result === true;
}

export async function saveMarketStateToRedis(rows: MarketStateRow[]): Promise<boolean> {
  const result = await withRedis(async () => {
    await getRedisClient().set(keys.marketState, JSON.stringify(rows), "EX", STATE_TTL_SEC);
    return true;
  });
  return result === true;
}

export async function loadMarketStateFromRedis(): Promise<MarketStateRow[] | null> {
  return withRedis(async () => {
    const raw = await getRedisClient().get(keys.marketState);
    if (!raw) return null;
    return JSON.parse(raw) as MarketStateRow[];
  });
}

export async function saveBotStatsToRedis(stats: BotStats): Promise<boolean> {
  const result = await withRedis(async () => {
    await getRedisClient().set(keys.stats, JSON.stringify(stats));
    return true;
  });
  return result === true;
}

export async function loadBotStatsFromRedis(): Promise<BotStats | null> {
  return withRedis(async () => {
    const raw = await getRedisClient().get(keys.stats);
    if (!raw) return null;
    return JSON.parse(raw) as BotStats;
  });
}

export async function recordOpportunityToRedis(opportunity: ArbitrageOpportunity): Promise<void> {
  await withRedis(async () => {
    const client = getRedisClient();
    await client.lpush(keys.opportunities, JSON.stringify(opportunity));
    await client.ltrim(keys.opportunities, 0, 49);
  });
}

export async function recordTradeToRedis(trade: TradeExecution): Promise<void> {
  await withRedis(async () => {
    const client = getRedisClient();
    await client.lpush(`${KEY_PREFIX}trades`, JSON.stringify(trade));
    await client.ltrim(`${KEY_PREFIX}trades`, 0, 49);
  });
}

export { closeRedisClient };
