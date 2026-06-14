import { discoverWorldCupMarkets } from "../src/api/gamma.js";
import { buildMarketStateRows } from "../src/arbitrage/scanner.js";
import { showBanner } from "../src/cli/banner.js";
import { displayEventSummary, displayMarketState } from "../src/cli/display.js";

async function main(): Promise<void> {
  showBanner();
  const groups = await discoverWorldCupMarkets(10_000, 30);
  console.log(`Found ${groups.length} events`);
  displayEventSummary(groups);

  const rows = await buildMarketStateRows(groups.slice(0, 3));
  displayMarketState(rows);
}

main().catch(console.error);
