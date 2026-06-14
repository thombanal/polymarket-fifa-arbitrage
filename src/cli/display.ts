import chalk from "chalk";
import Table from "cli-table3";
import type {
  ArbitrageOpportunity,
  ArbitrageSettings,
  EventGroup,
  MarketStateRow,
  TradeExecution,
} from "../types.js";

function formatUsd(value: number | null): string {
  if (value === null) return chalk.gray("—");
  return `$${value.toFixed(4)}`;
}

function formatMoney(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function displaySettings(settings: ArbitrageSettings): void {
  const table = new Table({
    head: [chalk.cyan("Setting"), chalk.cyan("Value")],
    colWidths: [28, 24],
  });

  table.push(
    ["Trading Mode", settings.tradingMode === "live" ? chalk.red("LIVE") : chalk.green("DRY RUN")],
    ["Min Edge", `${(settings.minEdge * 100).toFixed(2)}%`],
    ["Max Position", formatMoney(settings.maxPositionUsd)],
    ["Scan Interval", `${settings.scanIntervalMs}ms`],
    ["Min Liquidity", formatMoney(settings.minLiquidityUsd)],
    ["Max Markets / Event", String(settings.maxMarkets)],
  );

  console.log(chalk.bold.white("\n⚙  Current Arbitrage Settings"));
  console.log(table.toString());
}

export function displayEventSummary(groups: EventGroup[]): void {
  const table = new Table({
    head: [
      chalk.cyan("Event"),
      chalk.cyan("Markets"),
      chalk.cyan("Neg-Risk"),
      chalk.cyan("Liquidity"),
      chalk.cyan("24h Volume"),
    ],
    colWidths: [42, 10, 10, 14, 14],
    wordWrap: true,
  });

  for (const group of groups.slice(0, 12)) {
    table.push([
      group.title,
      String(group.markets.length),
      group.negRisk ? chalk.yellow("Yes") : "No",
      formatMoney(group.liquidity),
      formatMoney(group.volume24hr),
    ]);
  }

  console.log(chalk.bold.white("\n🏆 Discovered World Cup Events"));
  console.log(table.toString());
}

export function displayMarketState(rows: MarketStateRow[]): void {
  const table = new Table({
    head: [
      chalk.cyan("Event"),
      chalk.cyan("Market"),
      chalk.cyan("YES Ask"),
      chalk.cyan("NO Ask"),
      chalk.cyan("Sum"),
      chalk.cyan("Liquidity"),
      chalk.cyan("Status"),
    ],
    colWidths: [28, 26, 10, 10, 10, 12, 14],
    wordWrap: true,
  });

  for (const row of rows.slice(0, 20)) {
    const sumColor =
      row.sum !== null && row.sum < 1
        ? chalk.green.bold
        : row.sum !== null && row.sum < 1.02
          ? chalk.yellow
          : chalk.white;

    table.push([
      row.event.length > 26 ? `${row.event.slice(0, 24)}…` : row.event,
      row.market.length > 24 ? `${row.market.slice(0, 22)}…` : row.market,
      formatUsd(row.yesPrice),
      formatUsd(row.noPrice),
      row.sum !== null ? sumColor(row.sum.toFixed(4)) : chalk.gray("—"),
      formatMoney(row.liquidity),
      row.status === "ARB CANDIDATE" ? chalk.green.bold(row.status) : chalk.gray(row.status),
    ]);
  }

  console.log(chalk.bold.white("\n📊 Current Market State"));
  console.log(chalk.gray("  Prices shown are best ask (cost to buy). Sum < 1.00 = arbitrage zone.\n"));
  console.log(table.toString());
}

export function displayOpportunity(opportunity: ArbitrageOpportunity): void {
  const legs = opportunity.legs
    .map((leg) => `${leg.outcome}: $${leg.price.toFixed(4)}`)
    .join("  |  ");

  console.log(
    chalk.green.bold("\n✦ ARBITRAGE DETECTED") +
      chalk.white(`  ${opportunity.type.toUpperCase()}  `) +
      chalk.gray(opportunity.eventTitle),
  );
  console.log(chalk.white(`  ${opportunity.marketQuestion}`));
  console.log(chalk.gray(`  Legs: ${legs}`));
  console.log(
    chalk.yellow(`  Cost: $${opportunity.totalCost.toFixed(4)}`) +
      chalk.green(`  Profit: ${opportunity.profitPercent.toFixed(2)}%`) +
      chalk.white(`  ($${opportunity.expectedProfit.toFixed(4)} per $1 payout)`),
  );
}

export function displayTradeResult(result: TradeExecution): void {
  const icon = result.success ? chalk.green("✓") : chalk.red("✗");
  const color = result.success ? chalk.green : chalk.red;
  console.log(color(`${icon} ${result.message}`));
}

export function displayHelp(): void {
  console.log(chalk.bold.white("\n📖 Commands"));
  console.log(chalk.cyan("  settings") + chalk.gray("  — Change arbitrage settings while trading"));
  console.log(chalk.cyan("  status") + chalk.gray("   — Show bot status and stats"));
  console.log(chalk.cyan("  markets") + chalk.gray("   — Refresh and show market state"));
  console.log(chalk.cyan("  pause") + chalk.gray("     — Pause scanning"));
  console.log(chalk.cyan("  resume") + chalk.gray("    — Resume scanning"));
  console.log(chalk.cyan("  help") + chalk.gray("      — Show this help"));
  console.log(chalk.cyan("  quit") + chalk.gray("      — Stop the bot\n"));
}

export function displayScanStatus(
  scanCount: number,
  opportunitiesFound: number,
  paused: boolean,
): void {
  const status = paused ? chalk.yellow("PAUSED") : chalk.green("SCANNING");
  console.log(
    chalk.gray(
      `[Scan #${scanCount}] ${status} | Opportunities found: ${opportunitiesFound} | ${new Date().toLocaleTimeString()}`,
    ),
  );
}
