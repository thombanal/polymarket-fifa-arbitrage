import { confirm, input, select } from "@inquirer/prompts";
import chalk from "chalk";
import type { ArbitrageSettings } from "../types.js";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parsePercentInput(value: string, current: number): number {
  const trimmed = value.trim().replace("%", "");
  if (!trimmed) return current;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return current;
  return parsed > 1 ? parsed / 100 : parsed;
}

export async function promptForSettings(current: ArbitrageSettings): Promise<ArbitrageSettings> {
  console.log(chalk.bold.cyan("\n── Arbitrage Settings ──\n"));

  const tradingMode = await select<"dry_run" | "live">({
    message: "Trading mode",
    default: current.tradingMode,
    choices: [
      { name: "Dry Run (simulate trades, no wallet needed)", value: "dry_run" },
      { name: "Live (requires wallet + API credentials)", value: "live" },
    ],
  });

  const minEdgeInput = await input({
    message: "Minimum edge / profit threshold (%)",
    default: (current.minEdge * 100).toFixed(2),
  });

  const maxPositionInput = await input({
    message: "Max position size per trade (USD)",
    default: String(current.maxPositionUsd),
  });

  const scanIntervalInput = await input({
    message: "Scan interval (milliseconds)",
    default: String(current.scanIntervalMs),
  });

  const minLiquidityInput = await input({
    message: "Minimum market liquidity (USD)",
    default: String(current.minLiquidityUsd),
  });

  const maxMarketsInput = await input({
    message: "Max markets per event to scan",
    default: String(current.maxMarkets),
  });

  const next: ArbitrageSettings = {
    tradingMode,
    minEdge: clamp(parsePercentInput(minEdgeInput, current.minEdge), 0.001, 0.5),
    maxPositionUsd: clamp(Number(maxPositionInput) || current.maxPositionUsd, 1, 10_000),
    scanIntervalMs: clamp(Number(scanIntervalInput) || current.scanIntervalMs, 1000, 120_000),
    minLiquidityUsd: clamp(Number(minLiquidityInput) || current.minLiquidityUsd, 0, 1_000_000),
    maxMarkets: clamp(Number(maxMarketsInput) || current.maxMarkets, 1, 200),
  };

  const confirmed = await confirm({
    message: "Apply these settings?",
    default: true,
  });

  return confirmed ? next : current;
}
