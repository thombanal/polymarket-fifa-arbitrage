import { CLOB_API } from "../config.js";
import type { TokenQuote } from "../types.js";

type PriceSide = "BUY" | "SELL";

async function fetchPrice(tokenId: string, side: PriceSide): Promise<number | null> {
  const url = `${CLOB_API}/price?token_id=${tokenId}&side=${side}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = (await response.json()) as { price?: string };
    const price = Number(data.price);
    return Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

export async function getTokenQuote(tokenId: string, outcome: string): Promise<TokenQuote> {
  const [bestBid, bestAsk] = await Promise.all([
    fetchPrice(tokenId, "BUY"),
    fetchPrice(tokenId, "SELL"),
  ]);

  const midpoint =
    bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : bestBid ?? bestAsk;

  return {
    tokenId,
    outcome,
    bestBid,
    bestAsk,
    midpoint,
  };
}

export async function getQuotesForMarket(
  outcomes: string[],
  tokenIds: string[],
): Promise<TokenQuote[]> {
  const pairs = outcomes.map((outcome, index) => ({
    outcome,
    tokenId: tokenIds[index],
  }));

  return Promise.all(pairs.map(({ outcome, tokenId }) => getTokenQuote(tokenId, outcome)));
}

export async function getBestAsk(tokenId: string): Promise<number | null> {
  return fetchPrice(tokenId, "SELL");
}
