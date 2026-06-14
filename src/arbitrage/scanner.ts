import { getBestAsk, getQuotesForMarket } from "../api/clob.js";
import type {
  ArbitrageOpportunity,
  ArbitrageSettings,
  EventGroup,
  MarketInfo,
  MarketStateRow,
} from "../types.js";

function findYesNoIndices(outcomes: string[]): { yes: number; no: number } | null {
  const yes = outcomes.findIndex((o) => o.toLowerCase() === "yes");
  const no = outcomes.findIndex((o) => o.toLowerCase() === "no");
  if (yes === -1 || no === -1) return null;
  return { yes, no };
}

export async function buildMarketStateRows(groups: EventGroup[]): Promise<MarketStateRow[]> {
  const rows: MarketStateRow[] = [];

  for (const group of groups) {
    for (const market of group.markets.slice(0, 8)) {
      const indices = findYesNoIndices(market.outcomes);
      if (!indices) continue;

      const quotes = await getQuotesForMarket(market.outcomes, market.clobTokenIds);
      const yesQuote = quotes[indices.yes];
      const noQuote = quotes[indices.no];

      const yesPrice = yesQuote.bestAsk ?? yesQuote.midpoint;
      const noPrice = noQuote.bestAsk ?? noQuote.midpoint;
      const sum = yesPrice !== null && noPrice !== null ? yesPrice + noPrice : null;
      const spread =
        yesQuote.bestBid !== null &&
        yesQuote.bestAsk !== null &&
        noQuote.bestBid !== null &&
        noQuote.bestAsk !== null
          ? (yesQuote.bestAsk - yesQuote.bestBid) + (noQuote.bestAsk - noQuote.bestBid)
          : null;

      let status = "Watching";
      if (sum !== null && sum < 1) status = "ARB CANDIDATE";
      else if (sum !== null && sum < 1.02) status = "Near parity";

      rows.push({
        event: group.title,
        market: market.groupItemTitle ?? market.question,
        yesPrice,
        noPrice,
        sum,
        spread,
        liquidity: market.liquidity,
        volume24h: market.volume24hr,
        status,
      });
    }
  }

  return rows;
}

async function scanBinaryMarket(
  market: MarketInfo,
  settings: ArbitrageSettings,
): Promise<ArbitrageOpportunity | null> {
  const indices = findYesNoIndices(market.outcomes);
  if (!indices) return null;

  const yesToken = market.clobTokenIds[indices.yes];
  const noToken = market.clobTokenIds[indices.no];
  const [yesAsk, noAsk] = await Promise.all([getBestAsk(yesToken), getBestAsk(noToken)]);

  if (yesAsk === null || noAsk === null) return null;

  const totalCost = yesAsk + noAsk;
  const expectedProfit = 1 - totalCost;

  if (expectedProfit < settings.minEdge) return null;

  return {
    type: "binary",
    eventTitle: market.eventTitle,
    marketQuestion: market.groupItemTitle ?? market.question,
    legs: [
      { outcome: "Yes", tokenId: yesToken, price: yesAsk },
      { outcome: "No", tokenId: noToken, price: noAsk },
    ],
    totalCost,
    expectedProfit,
    profitPercent: expectedProfit * 100,
    maxSizeUsd: settings.maxPositionUsd,
    detectedAt: new Date(),
  };
}

async function scanNegRiskBundle(
  group: EventGroup,
  settings: ArbitrageSettings,
): Promise<ArbitrageOpportunity | null> {
  if (!group.negRisk || group.markets.length < 2) return null;

  const legs: ArbitrageOpportunity["legs"] = [];
  const topMarkets = [...group.markets]
    .sort((a, b) => b.liquidity - a.liquidity)
    .slice(0, 15);

  for (const market of topMarkets) {
    const yesIndex = market.outcomes.findIndex((o) => o.toLowerCase() === "yes");
    if (yesIndex === -1) continue;

    const tokenId = market.clobTokenIds[yesIndex];
    const price = await getBestAsk(tokenId);
    if (price === null) return null;

    legs.push({
      outcome: market.groupItemTitle ?? market.question,
      tokenId,
      price,
    });
  }

  if (legs.length < 2) return null;

  const totalCost = legs.reduce((sum, leg) => sum + leg.price, 0);
  const expectedProfit = 1 - totalCost;

  if (expectedProfit < settings.minEdge) return null;

  return {
    type: "negrisk_bundle",
    eventTitle: group.title,
    marketQuestion: `${group.title} (full outcome set)`,
    legs,
    totalCost,
    expectedProfit,
    profitPercent: expectedProfit * 100,
    maxSizeUsd: settings.maxPositionUsd,
    detectedAt: new Date(),
  };
}

export async function scanForOpportunities(
  groups: EventGroup[],
  settings: ArbitrageSettings,
): Promise<ArbitrageOpportunity[]> {
  const opportunities: ArbitrageOpportunity[] = [];

  for (const group of groups) {
    if (group.negRisk) {
      const bundle = await scanNegRiskBundle(group, settings);
      if (bundle) opportunities.push(bundle);
    }

    for (const market of group.markets) {
      const binary = await scanBinaryMarket(market, settings);
      if (binary) opportunities.push(binary);
    }
  }

  return opportunities.sort((a, b) => b.expectedProfit - a.expectedProfit);
}
