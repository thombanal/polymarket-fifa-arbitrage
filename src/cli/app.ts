import chalk from "chalk";
import ora from "ora";
import { createInterface } from "node:readline";
import { discoverWorldCupMarkets } from "../api/gamma.js";
import { TradeExecutor } from "../arbitrage/executor.js";
import { buildMarketStateRows, scanForOpportunities } from "../arbitrage/scanner.js";
import { loadSettings, loadSettingsWithRedis } from "../config.js";
import { pingRedis } from "../redis/client.js";
import {
  closeRedisClient,
  loadBotStatsFromRedis,
  loadMarketsFromRedis,
  recordOpportunityToRedis,
  recordTradeToRedis,
  saveBotStatsToRedis,
  saveMarketStateToRedis,
  saveMarketsToRedis,
  saveSettingsToRedis,
} from "../redis/store.js";
import type { ArbitrageSettings, EventGroup } from "../types.js";
import { showBanner } from "./banner.js";
import {
  displayEventSummary,
  displayHelp,
  displayMarketState,
  displayOpportunity,
  displayScanStatus,
  displaySettings,
  displayTradeResult,
} from "./display.js";
import { promptForSettings } from "./settings-menu.js";

export class TradingApp {
  private settings: ArbitrageSettings;
  private groups: EventGroup[] = [];
  private executor: TradeExecutor;
  private running = true;
  private paused = false;
  private scanning = false;
  private scanCount = 0;
  private opportunitiesFound = 0;
  private redisConnected = false;
  private commandQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.settings = loadSettings();
    this.executor = new TradeExecutor(this.settings);
  }

  async start(): Promise<void> {
    showBanner();

    this.settings = await loadSettingsWithRedis();
    this.executor.updateSettings(this.settings);
    this.redisConnected = await pingRedis();

    const cachedStats = await loadBotStatsFromRedis();
    if (cachedStats) {
      this.scanCount = cachedStats.scanCount;
      this.opportunitiesFound = cachedStats.opportunitiesFound;
    }

    displaySettings(this.settings);
    console.log(
      this.redisConnected
        ? chalk.green("  Redis: connected — settings, markets, and stats are cached")
        : chalk.gray("  Redis: disabled or unavailable — running without cache"),
    );
    displayHelp();

    await this.refreshMarkets(true);
    this.startCommandListener();
    await this.runScanLoop();
  }

  private async refreshMarkets(showState = false, forceRefresh = false): Promise<void> {
    const spinner = ora("Fetching World Cup markets from Polymarket...").start();

    try {
      if (!forceRefresh) {
        const cached = await loadMarketsFromRedis(
          this.settings.minLiquidityUsd,
          this.settings.maxMarkets,
        );
        if (cached && cached.length > 0) {
          this.groups = cached;
          spinner.succeed(`Loaded ${this.groups.length} World Cup events (Redis cache)`);
          displayEventSummary(this.groups);

          if (showState) {
            await this.showMarketState();
          }
          return;
        }
      }

      this.groups = await discoverWorldCupMarkets(
        this.settings.minLiquidityUsd,
        this.settings.maxMarkets,
      );
      await saveMarketsToRedis(
        this.settings.minLiquidityUsd,
        this.settings.maxMarkets,
        this.groups,
      );
      spinner.succeed(`Loaded ${this.groups.length} World Cup events`);

      displayEventSummary(this.groups);

      if (showState) {
        await this.showMarketState();
      }
    } catch (error) {
      spinner.fail("Failed to load markets");
      throw error;
    }
  }

  private async showMarketState(): Promise<void> {
    const stateSpinner = ora("Loading live order book prices...").start();
    const rows = await buildMarketStateRows(this.groups);
    await saveMarketStateToRedis(rows);
    stateSpinner.succeed(`Market state ready (${rows.length} markets)`);
    displayMarketState(rows);
  }

  private startCommandListener(): void {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    console.log(chalk.gray("\nType a command and press Enter (e.g. settings, status, help)\n"));

    rl.on("line", (line) => {
      const command = line.trim().toLowerCase();
      this.commandQueue = this.commandQueue.then(() => this.handleCommand(command));
    });
  }

  private async handleCommand(command: string): Promise<void> {
    switch (command) {
      case "settings":
      case "s":
        await this.openSettings();
        break;
      case "status":
        this.showStatus();
        break;
      case "markets":
      case "m":
        await this.refreshMarkets(true, true);
        break;
      case "pause":
      case "p":
        this.paused = true;
        console.log(chalk.yellow("\n⏸  Scanning paused. Type 'resume' to continue.\n"));
        break;
      case "resume":
      case "r":
        this.paused = false;
        console.log(chalk.green("\n▶  Scanning resumed.\n"));
        break;
      case "help":
      case "h":
      case "?":
        displayHelp();
        break;
      case "quit":
      case "exit":
      case "q":
        await this.shutdown();
        break;
      case "":
        break;
      default:
        console.log(chalk.yellow(`Unknown command: "${command}". Type 'help' for options.`));
    }
  }

  private async openSettings(): Promise<void> {
    if (this.scanning) {
      console.log(chalk.gray("\n(settings opened — scanning continues in background)\n"));
    }

    const previous = { ...this.settings };
    const updated = await promptForSettings(this.settings);

    if (JSON.stringify(updated) !== JSON.stringify(previous)) {
      this.settings = updated;
      this.executor.updateSettings(updated);
      await saveSettingsToRedis(updated);
      console.log(chalk.green("\n✓ Settings updated.\n"));
      displaySettings(this.settings);

      const reload = updated.minLiquidityUsd !== previous.minLiquidityUsd ||
        updated.maxMarkets !== previous.maxMarkets;

      if (reload) {
        await this.refreshMarkets(false);
      }
    } else {
      console.log(chalk.gray("\nSettings unchanged.\n"));
    }
  }

  private showStatus(): void {
    const stats = this.executor.getStats();
    console.log(chalk.bold.white("\n📈 Bot Status"));
    displaySettings(this.settings);
    console.log(chalk.white(`  Events tracked: ${this.groups.length}`));
    console.log(chalk.white(`  Scans completed: ${this.scanCount}`));
    console.log(chalk.white(`  Opportunities found: ${this.opportunitiesFound}`));
    console.log(chalk.white(`  Trades executed: ${stats.tradesExecuted}`));
    console.log(
      chalk.white(`  Simulated profit: $${stats.totalSimulatedProfit.toFixed(4)}`),
    );
    console.log(chalk.white(`  State: ${this.paused ? "PAUSED" : "ACTIVE"}`));
    console.log(
      chalk.white(`  Redis: ${this.redisConnected ? "connected" : "unavailable"}\n`),
    );
  }

  private async persistStats(): Promise<void> {
    const stats = this.executor.getStats();
    await saveBotStatsToRedis({
      scanCount: this.scanCount,
      opportunitiesFound: this.opportunitiesFound,
      tradesExecuted: stats.tradesExecuted,
      totalSimulatedProfit: stats.totalSimulatedProfit,
      updatedAt: new Date().toISOString(),
    });
  }

  private async shutdown(): Promise<void> {
    this.running = false;
    await this.persistStats();
    await closeRedisClient();
    console.log(chalk.cyan("\n👋 Shutting down bot. Good luck!\n"));
    process.exit(0);
  }

  private async runScanLoop(): Promise<void> {
    console.log(chalk.green.bold("\n🚀 Trading started. Monitoring for arbitrage opportunities...\n"));

    while (this.running) {
      if (!this.paused) {
        this.scanning = true;

        try {
          const opportunities = await scanForOpportunities(this.groups, this.settings);
          this.scanCount += 1;

          if (opportunities.length > 0) {
            this.opportunitiesFound += opportunities.length;

            for (const opportunity of opportunities) {
              displayOpportunity(opportunity);
              await recordOpportunityToRedis(opportunity);
              const result = await this.executor.execute(opportunity);
              displayTradeResult(result);
              await recordTradeToRedis(result);
            }
          } else {
            displayScanStatus(this.scanCount, this.opportunitiesFound, this.paused);
          }

          await this.persistStats();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.log(chalk.red(`Scan error: ${message}`));
        }

        this.scanning = false;
      } else {
        displayScanStatus(this.scanCount, this.opportunitiesFound, this.paused);
      }

      await sleep(this.settings.scanIntervalMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
