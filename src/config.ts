import "dotenv/config";
import type { ArbitrageSettings } from "./types.js";

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadSettings(overrides?: Partial<ArbitrageSettings>): ArbitrageSettings {
  const tradingMode = process.env.TRADING_MODE === "live" ? "live" : "dry_run";

  const defaults: ArbitrageSettings = {
    minEdge: parseNumber(process.env.MIN_EDGE, 0.01),
    maxPositionUsd: parseNumber(process.env.MAX_POSITION_USD, 50),
    scanIntervalMs: parseNumber(process.env.SCAN_INTERVAL_MS, 5000),
    minLiquidityUsd: parseNumber(process.env.MIN_LIQUIDITY_USD, 10_000),
    maxMarkets: parseNumber(process.env.MAX_MARKETS, 30),
    tradingMode,
  };

  return { ...defaults, ...overrides };
}

export async function loadSettingsWithRedis(
  overrides?: Partial<ArbitrageSettings>,
): Promise<ArbitrageSettings> {
  const envSettings = loadSettings();
  const { loadSettingsFromRedis } = await import("./redis/store.js");
  const cached = await loadSettingsFromRedis();

  return {
    ...envSettings,
    ...cached,
    ...overrides,
  };
}

export const GAMMA_API = "https://gamma-api.polymarket.com";
export const CLOB_API = "https://clob.polymarket.com";

export const WORLD_CUP_SEARCH_QUERIES = [
  "world cup",
  "2026 fifa world cup",
  "World Cup Winner",
  "World Cup",
];
