export interface ArbitrageSettings {
  minEdge: number;
  maxPositionUsd: number;
  scanIntervalMs: number;
  minLiquidityUsd: number;
  maxMarkets: number;
  tradingMode: "dry_run" | "live";
}

export interface TokenQuote {
  tokenId: string;
  outcome: string;
  bestBid: number | null;
  bestAsk: number | null;
  midpoint: number | null;
}

export interface MarketInfo {
  id: string;
  eventId: string;
  eventTitle: string;
  question: string;
  groupItemTitle: string | null;
  slug: string;
  outcomes: string[];
  outcomePrices: number[];
  clobTokenIds: string[];
  enableOrderBook: boolean;
  liquidity: number;
  volume24hr: number;
  negRisk: boolean;
  active: boolean;
  closed: boolean;
}

export interface EventGroup {
  id: string;
  title: string;
  slug: string;
  negRisk: boolean;
  liquidity: number;
  volume24hr: number;
  markets: MarketInfo[];
}

export interface ArbitrageOpportunity {
  type: "binary" | "negrisk_bundle";
  eventTitle: string;
  marketQuestion: string;
  legs: Array<{
    outcome: string;
    tokenId: string;
    price: number;
  }>;
  totalCost: number;
  expectedProfit: number;
  profitPercent: number;
  maxSizeUsd: number;
  detectedAt: Date;
}

export interface MarketStateRow {
  event: string;
  market: string;
  yesPrice: number | null;
  noPrice: number | null;
  sum: number | null;
  spread: number | null;
  liquidity: number;
  volume24h: number;
  status: string;
}

export interface TradeExecution {
  opportunity: ArbitrageOpportunity;
  mode: "dry_run" | "live";
  success: boolean;
  message: string;
  timestamp: Date;
}
