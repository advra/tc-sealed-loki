#!/usr/bin/env node

/**
 * scrape-tcgp-product.ts (product-loki)
 *
 * Scrapes TCGPlayer product prices by card condition (NM, LP, MP, HP, DMG).
 *
 * For each condition, navigates to the condition-filtered listing page:
 *   https://www.tcgplayer.com/product/{id}?Language=English&Condition={condition}&page=1
 *
 * Extracts:
 *   - Market price (from "Market Price $X.XX" text)
 *   - Lowest listed price (from "As low as $X.XX" text)
 *   - Number of listings (from "X Listings" text)
 *
 * Usage:
 *   npx tsx src/scraper/scrape-tcgp-product.ts <tcgplayerId>
 *   npx tsx src/scraper/scrape-tcgp-product.ts 94147
 *   npx tsx src/scraper/scrape-tcgp-product.ts 94147 --output prices.json
 */

import fs from "node:fs";
import { chromium } from "playwright";
import { ImportLogger } from "../logger/import-logger";
import { ProductCondition, ConditionPrice, ScrapedProductPrices } from "../types";
import { sleep, jitter } from "../utils";

// ============ CONSTANTS ============

const CONDITIONS: { param: string; label: ProductCondition }[] = [
  { param: "Near+Mint", label: "NM" },
  { param: "Lightly+Played", label: "LP" },
  { param: "Moderately+Played", label: "MP" },
  { param: "Heavily+Played", label: "HP" },
  { param: "Damaged", label: "DMG" },
];

// ============ SCRAPE SINGLE CONDITION PAGE ============

async function scrapeConditionPage(
  page: any,
  tcgplayerId: string,
  conditionParam: string,
  conditionLabel: ProductCondition,
  logger: ImportLogger,
): Promise<ConditionPrice> {
  const url = `https://www.tcgplayer.com/product/${tcgplayerId}?Language=English&Condition=${conditionParam}&page=1`;

  logger.log(`  Navigating to: ${url}`);

  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await sleep(jitter(3000, 5000));

  // Get the full page text
  const bodyText = await page.evaluate(() => document.body.innerText);

  // Extract market price: look for "Market Price $X.XX" or "Market Price $X.XX"
  const marketPriceMatch = bodyText.match(/Market\s*Price\s*\$?([\d,]+\.?\d*)/i);
  const marketPrice = marketPriceMatch
    ? marketPriceMatch[1]?.replace(/,/g, "")
    : undefined;

  // Extract lowest price: look for "As low as $X.XX" or "as low as $X.XX"
  const lowestPriceMatch = bodyText.match(/(?:As\s+low\s+as|as\s+low\s+as)\s*\$?([\d,]+\.?\d*)/i);
  const lowestPrice = lowestPriceMatch
    ? lowestPriceMatch[1]?.replace(/,/g, "")
    : undefined;

  // Extract listing count: look for "X Listings" or "X listings"
  const listingsMatch = bodyText.match(/(\d+)\s+Listings?/i);
  const listings = listingsMatch ? Number.parseInt(listingsMatch[1], 10) : undefined;

  logger.log(
    `    ${conditionLabel}: market=${marketPrice ?? "N/A"}, lowest=${lowestPrice ?? "N/A"}, listings=${listings ?? "N/A"}`,
  );

  return {
    condition: conditionLabel,
    marketPrice,
    listedPrice: lowestPrice,
    listings,
  };
}

// ============ SCRAPE PRODUCT NAME ============

async function scrapeProductName(
  page: any,
  tcgplayerId: string,
  logger: ImportLogger,
): Promise<string> {
  const url = `https://www.tcgplayer.com/product/${tcgplayerId}`;

  logger.log(`Getting product name from: ${url}`);

  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await sleep(jitter(2000, 3000));

  // Try page title first
  try {
    const title = await page.title();
    if (title && !title.includes("Your Trusted Marketplace")) {
      return title.replace(/\s*\|\s*TCGplayer.*$/i, "").trim();
    }
  } catch {
    // fallback
  }

  // Try h1 heading
  try {
    const h1 = await page.$eval("h1", (el: any) => el.textContent?.trim() ?? "");
    if (h1) return h1;
  } catch {
    // fallback
  }

  return `Product ${tcgplayerId}`;
}

// ============ CLI ARGS ============

function parseArgs() {
  const args = process.argv.slice(2);
  const options: {
    tcgplayerId: string;
    output: string;
    help: boolean;
  } = {
    tcgplayerId: "",
    output: "",
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--output" && i + 1 < args.length) {
      const outputArg = args[++i];
      if (outputArg === undefined) {
        console.error("Error: --output requires a value");
        process.exit(1);
      }
      options.output = outputArg;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (!arg.startsWith("--")) {
      options.tcgplayerId = arg;
    } else {
      console.error(`Error: Unknown argument ${arg}`);
      console.error("Use --help for usage information");
      process.exit(1);
    }
  }

  return options;
}

function showHelp() {
  console.log(`
product-loki - TCGPlayer Product Price Scraper by Condition

Scrapes TCGPlayer product prices broken down by card condition (NM, LP, MP, HP, DMG).
Visits each condition-filtered listing page to extract market price, lowest price, and listing count.

Usage:
  npx tsx src/scraper/scrape-tcgp-product.ts <tcgplayerId> [options]

Options:
  --output <path>    Output JSON file path (default: stdout)
  --help, -h         Show this help message

Examples:
  npx tsx src/scraper/scrape-tcgp-product.ts 94147
  npx tsx src/scraper/scrape-tcgp-product.ts 94147 --output prices.json
  npm run product -- 94147
  `);
}

// ============ MAIN ============

async function main() {
  const options = parseArgs();

  if (options.help || !options.tcgplayerId) {
    showHelp();
    if (!options.tcgplayerId) {
      console.error("\nError: TCGPlayer product ID is required");
    }
    return;
  }

  const logger = new ImportLogger();

  logger.log("🚀 Starting product-loki (TCGPlayer Product Price Scraper)");
  logger.log("=========================================================");
  logger.log(`Product ID: ${options.tcgplayerId}`);
  logger.log("=========================================================\n");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  let productName: string;
  const prices: ConditionPrice[] = [];

  try {
    // Step 1: Get the product name from the main product page
    logger.log("📋 Step 1: Getting product name...");
    productName = await scrapeProductName(page, options.tcgplayerId, logger);
    logger.log(`  Product: ${productName}\n`);

    // Step 2: Scrape each condition page
    logger.log("📊 Step 2: Scraping condition pages...");
    for (const cond of CONDITIONS) {
      logger.log(`  --- ${cond.label} (${cond.param}) ---`);
      const price = await scrapeConditionPage(
        page,
        options.tcgplayerId,
        cond.param,
        cond.label,
        logger,
      );
      prices.push(price);

      // Throttle between requests
      await sleep(jitter(1000, 2000));
    }
  } catch (err) {
    logger.error("Fatal error during scraping", err);
    productName = "Error";
  } finally {
    await browser.close();
  }

  const result: ScrapedProductPrices = {
    tcgplayerId: options.tcgplayerId,
    productName,
    scrapedAt: new Date().toISOString(),
    prices,
  };

  // ============ OUTPUT ============

  const outputJson = JSON.stringify(result, null, 2);

  if (options.output) {
    fs.writeFileSync(options.output, outputJson, "utf8");
    logger.log(`\n📄 Output written to: ${options.output}`);
  } else {
    console.log("\n" + outputJson);
  }

  // ============ SUMMARY ============

  logger.log("\n================================================");
  logger.log("📊 SCRAPE SUMMARY");
  logger.log("================================================");
  logger.log(`✅ Product: ${result.productName}`);
  logger.log(`🆔 TCGPlayer ID: ${result.tcgplayerId}`);
  logger.log(`📊 Conditions found: ${result.prices.length}`);
  for (const p of result.prices) {
    logger.log(
      `   ${p.condition}: market=${p.marketPrice ?? "N/A"}, lowest=${p.listedPrice ?? "N/A"}, listings=${p.listings ?? "N/A"}`,
    );
  }
  logger.log(`📝 Log file: ${logger.getLogFilePath()}`);
  logger.log("================================================\n");

  logger.log("🎉 Scraping completed!");

  logger.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
