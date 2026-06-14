import { Redis } from "ioredis";

let redisClient: Redis | null = null;

function parseIntOrDefault(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export type RedisClient = Redis;

export function isRedisEnabled(): boolean {
  if (process.env.REDIS_ENABLED === "false") {
    return false;
  }

  return (
    process.env.REDIS_ENABLED === "true" ||
    Boolean(process.env.REDIS_URL?.trim()) ||
    Boolean(process.env.REDIS_HOST?.trim())
  );
}

export function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    redisClient = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    return redisClient;
  }

  redisClient = new Redis({
    host: process.env.REDIS_HOST?.trim() || "127.0.0.1",
    port: parseIntOrDefault(process.env.REDIS_PORT, 6379),
    username: process.env.REDIS_USERNAME?.trim() || undefined,
    password: process.env.REDIS_PASSWORD?.trim() || undefined,
    db: parseIntOrDefault(process.env.REDIS_DB, 0),
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  return redisClient;
}

export async function pingRedis(): Promise<boolean> {
  if (!isRedisEnabled()) {
    return false;
  }

  try {
    const client = getRedisClient();
    if (client.status !== "ready") {
      await client.connect();
    }
    const result = await client.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}

export async function closeRedisClient(): Promise<void> {
  if (!redisClient) {
    return;
  }

  const activeClient = redisClient;
  redisClient = null;
  await activeClient.quit();
}
