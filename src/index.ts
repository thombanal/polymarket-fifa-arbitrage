import chalk from "chalk";
import { TradingApp } from "./cli/app.js";
import { closeRedisClient } from "./redis/client.js";

async function main(): Promise<void> {
  const app = new TradingApp();

  process.on("SIGINT", async () => {
    console.log(chalk.cyan("\n\nReceived interrupt. Exiting...\n"));
    await closeRedisClient();
    process.exit(0);
  });

  try {
    await app.start();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFatal error: ${message}\n`));
    process.exit(1);
  }
}

main();
