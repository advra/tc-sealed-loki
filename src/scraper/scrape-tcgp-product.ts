#!/usr/bin/env node

/**
 * scrape-tcgp-product.ts (product-loki)
 *
 * Scrapes TCGPlayer product prices by card condition (NM, LP, MP, HP, DMG).
 *
 * Uses TCGPlayer's internal APIs directly (no browser needed):
 *   1. GET  https://mp-search-api.tcgplayer.com/v2/product/{id}/details
 *      → Returns product info + SKUs with condition names
 *   2. POST https://mpgateway.tcgplayer.com/v1/pricepoints/marketprice/skus/search
 *      → Returns market prices per SKU
 *
 * Usage:
 *   npx tsx src/scraper/scrape-tcgp-product.ts <tcgplayerId>
 *   npx tsx src/scraper/scrape-tcgp-product.ts 94147
 *   npx tsx src/scraper/scrape-tcgp-product.ts 94147 --output prices.json
 */

import fs from "node:fs";
import { ImportLogger } from "../logger/import-logger";
import { ProductCondition, ConditionPrice, ScrapedProductPrices } from "../types";

// ============ CONSTANTS ============

const CONDITION_MAP: Record<string, ProductCondition> = {
  "Near Mint": "NM",
  "Lightly Played": "LP",
  "Moderately Played": "MP",
  "Heavily Played": "HP",
  Damaged: "DMG",
};

const API_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Content-Type": "application/json",
};

// ============ API TYPES ============

interface ProductDetailsSku {
  sku: number;
  condition: string;
  variant: string;
  language: string;
}

interface ProductDetailsResponse {
  productId: number;
  productName: string;
  skus: ProductDetailsSku[];
  marketPrice?: number;
  lowestPrice?: number;
  listings?: number;
  medianPrice?: number;
}

interface SkuPricePoint {
  skuId: number;
  marketPrice: number;
  lowestPrice: number;
  highestPrice: number;
  priceCount: number;
  calculatedAt: string;
}

// ============ API CALLS ============

async function fetchProductDetails(
  tcgplayerId: string,
): Promise<ProductDetailsResponse | null> {
  const url = `https://mp-search-api.tcgplayer.com/v2/product/${tcgplayerId}/details`;

  const response = await fetch(url, { headers: API_HEADERS });

  if (!response.ok) {
    throw new Error(`Product details API returned ${response.status}`);
  }

  return (await response.json()) as ProductDetailsResponse;
}

async function fetchSkuPrices(
  skuIds: number[],
): Promise<SkuPricePoint[]> {
  const url = `https://mpgateway.tcgplayer.com/v1/pricepoints/marketprice/skus/search`;

  const response = await fetch(url, {
    method: "POST",
    headers: API_HEADERS,
    body: JSON.stringify({ skuIds }),
  });

  if (!response.ok) {
    throw new Error(`SKU price API returned ${response.status}`);
  }

  const data = (await response.json()) as SkuPricePoint[];

  // The API returns an array of price points
  return data;
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
    } else if (arg.startsWith("--")) {
      console.error(`Error: Unknown argument ${arg}`);
      console.error("Use --help for usage information");
      process.exit(1);
    } else {
      options.tcgplayerId = arg;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
product-loki - TCGPlayer Product Price Scraper by Condition

Scrapes TCGPlayer product prices broken down by card condition (NM, LP, MP, HP, DMG).
Uses TCGPlayer's internal APIs directly — no browser needed, fast single-request per condition.

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

  let productName: string;
  const prices: ConditionPrice[] = [];

  try {
    // Step 1: Fetch product details (includes SKUs with condition names)
    logger.log("📋 Step 1: Fetching product details...");
    const details = await fetchProductDetails(options.tcgplayerId);

    if (!details) {
      logger.error("Failed to fetch product details");
      return;
    }

    productName = details.productName || `Product ${options.tcgplayerId}`;
    logger.log(`  Product: ${productName}`);
    logger.log(`  SKUs found: ${details.skus?.length ?? 0}\n`);

    // Step 2: Filter to English language SKUs with recognized conditions
    const conditionSkus =
      details.skus?.filter(
        (sku) =>
          sku.language === "English" &&
          CONDITION_MAP[sku.condition],
      ) ?? [];

    if (conditionSkus.length === 0) {
      logger.log("  No English SKUs with recognized conditions found for this product.");
      // Still output what we have
      const result: ScrapedProductPrices = {
        tcgplayerId: options.tcgplayerId,
        productName,
        scrapedAt: new Date().toISOString(),
        prices: [],
      };
      const outputJson = JSON.stringify(result, null, 2);
      if (options.output) {
        fs.writeFileSync(options.output, outputJson, "utf8");
      } else {
        console.log("\n" + outputJson);
      }
      return;
    }

    // Step 3: Fetch market prices for all SKUs in a single API call
    logger.log("📊 Step 3: Fetching market prices for all conditions...");
    const skuIds = conditionSkus.map((sku) => sku.sku);
    const priceData = await fetchSkuPrices(skuIds);

    // Build a lookup map from SKU ID to price data
    const priceMap = new Map<number, SkuPricePoint>();
    for (const p of priceData) {
      priceMap.set(p.skuId, p);
    }

    // Step 4: Build condition prices
    logger.log("  Building condition prices...");
    for (const sku of conditionSkus) {
      const condition = CONDITION_MAP[sku.condition] ?? "NM";
      const skuPrice = priceMap.get(sku.sku);

      prices.push({
        condition,
        variant: sku.variant,
        marketPrice: skuPrice?.marketPrice?.toString(),
        listedPrice: skuPrice?.lowestPrice?.toString(),
        listings: skuPrice?.priceCount,
      });

      logger.log(
        `    ${condition} (${sku.variant}): market=${skuPrice?.marketPrice ?? "N/A"}, lowest=${skuPrice?.lowestPrice ?? "N/A"}, listings=${skuPrice?.priceCount ?? "N/A"}`,
      );
    }
  } catch (err) {
    logger.error("Fatal error during scraping", err);
    productName = "Error";
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
