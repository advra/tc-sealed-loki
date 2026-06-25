#!/usr/bin/env node

/**
 * scrape-tcgp-sealed-v2.ts
 *
 * New approach:
 * 1. Query TCGdex API for all English Pokemon TCG sets (id + name)
 * 2. For each set, search TCGPlayer for sealed products using:
 *    https://www.tcgplayer.com/search/all/product?q=pokemon+{setName}&view=grid&ProductTypeName=Sealed+Products&page=1
 * 3. Scrape product name and TCGPlayer product ID from search results
 * 4. Output as JSON with set info from TCGdex
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { ImportLogger } from "../logger/import-logger";
import { TcgdexSet, TcgpProduct, ScrapedProduct } from "../types";
import { sleep, jitter } from "../utils";

// ============ FETCH SETS FROM TCGDEX ============


async function fetchTcgdexSets(logger: ImportLogger): Promise<TcgdexSet[]> {
  logger.log("Fetching English Pokemon TCG sets from TCGdex API...");

  const url = "https://api.tcgdex.net/v2/en/sets";

  const response = await fetch(url, {
    headers: {
      "User-Agent": "TopChasedCatalogBot/1.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    logger.error(`TCGdex API returned ${response.status}`);
    return [];
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    logger.error("TCGdex API returned unexpected format");
    return [];
  }

  const sets: TcgdexSet[] = data.map((s: any) => ({
    id: s.id ?? "",
    name: s.name ?? "",
  })).filter((s) => s.id && s.name);

  logger.log(`Found ${sets.length} English Pokemon TCG sets from TCGdex`);
  return sets;
}

// ============ SCRAPE TCGPLAYER SEARCH RESULTS FOR A SET ============

async function scrapeTcgpSearch(
  page: any,
  setName: string,
  logger: ImportLogger,
): Promise<TcgpProduct[]> {
  const products: TcgpProduct[] = [];
  // Track seen product IDs across ALL pages to prevent duplicates
  const seenIds = new Set<string>();
  let pageNum = 1;
  const maxPages = 5; // Safety limit

  while (pageNum <= maxPages) {
    // Build the search URL: q=pokemon+{setName}
    const query = `pokemon ${setName}`;
    const url =
      `https://www.tcgplayer.com/search/all/product` +
      `?q=${encodeURIComponent(query)}` +
      `&view=grid` +
      `&ProductTypeName=Sealed+Products` +
      `&page=${pageNum}`;

    logger.log(`  [Set: ${setName}] Searching page ${pageNum}...`);

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
      await sleep(jitter(2000, 4000));

      // Try to find product links - TCGPlayer uses anchor tags with href containing /product/
      const links = await page.$$eval("a[href*='/product/']", (els) => {
        return els
          .map((a) => ({
            href: a.getAttribute("href") ?? "",
            text: a.textContent?.trim() ?? "",
          }))
          .filter((x) => x.href.includes("/product/") && x.text.length > 0);
      });

      if (links.length === 0) {
        logger.log(`  [Set: ${setName}] No products found on page ${pageNum}, stopping.`);
        break;
      }

      // Deduplicate by product ID across all pages
      for (const link of links) {
        const id = extractProductId(link.href);
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        products.push({
          tcgplayerId: id,
          name: link.text.replace(/\s+/g, " ").trim(),
          // url: toFullUrl(link.href),
        });
      }

      logger.log(`  [Set: ${setName}] Found ${products.length} unique products so far`);


      // Check if there's a next page
      const hasNextPage = await page.$(
        "a[rel='next'], button[aria-label='Next'], [class*='pagination'] a:last-child:not([class*='disabled'])",
      );
      if (!hasNextPage) {
        logger.log(`  [Set: ${setName}] No more pages.`);
        break;
      }

      pageNum++;
      await sleep(jitter(1000, 2000));
    } catch (err) {
      logger.error(`  [Set: ${setName}] Failed to load page ${pageNum}`, err);
      break;
    }
  }

  return products;
}

// ============ CLI ARGS ============

function parseArgs() {
  const args = process.argv.slice(2);
  const options: {
    limit: number;
    output: string;
    help: boolean;
    sets: string[];
  } = {
    limit: 0,
    output: `pokemon-sealed-tcgplayer-v2-${Math.floor(Date.now() / 1000)}.json`,
    help: false,
    sets: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--limit" && i + 1 < args.length) {
      const limitArg = args[++i];
      if (limitArg === undefined) {
        console.error("Error: --limit requires a value");
        process.exit(1);
      }
      options.limit = Number.parseInt(limitArg, 10);
      if (Number.isNaN(options.limit) || options.limit < 0) {
        console.error("Error: --limit must be a positive number");
        process.exit(1);
      }
    } else if (arg === "--output" && i + 1 < args.length) {
      const outputArg = args[++i];
      if (outputArg === undefined) {
        console.error("Error: --output requires a value");
        process.exit(1);
      }
      options.output = outputArg;
    } else if (arg === "--set" && i + 1 < args.length) {
      const setArg = args[++i];
      if (setArg === undefined) {
        console.error("Error: --set requires a value");
        process.exit(1);
      }
      options.sets.push(setArg);
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
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
TCGPlayer Sealed Product Scraper v2 - Scrape Pokemon sealed products from TCGPlayer

New approach:
  1. Query TCGdex API for all English Pokemon TCG sets
  2. For each set, search TCGPlayer for sealed products using:
     https://www.tcgplayer.com/search/all/product?q=pokemon+{setName}&view=grid&ProductTypeName=Sealed+Products&page=1
  3. Scrape product name and TCGPlayer product ID from search results
  4. Output as JSON with set info from TCGdex

Usage:
  npx tsx src/scrape/scrape-tcgp-sealed-v2.ts [options]

Options:
  --limit <number>   Max products to scrape (0 = all, useful for testing e.g. --limit 1)
  --output <path>    Output JSON file path (default: pokemon-sealed-tcgplayer-v2-<timestamp>.json)
  --set <name>       Only scrape a specific set by TCGdex name (can be used multiple times, e.g. --set "151")
  --help, -h         Show this help message

Examples:
  npx tsx src/scrape/scrape-tcgp-sealed-v2.ts
  npx tsx src/scrape/scrape-tcgp-sealed-v2.ts --limit 1
  npx tsx src/scrape/scrape-tcgp-sealed-v2.ts --set "151"
  npx tsx src/scrape/scrape-tcgp-sealed-v2.ts --set "151" --set "Scarlet & Violet"
  npx tsx src/scrape/scrape-tcgp-sealed-v2.ts --limit 50 --output test-output.json
  `);
}

// ============ MAIN ============

async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    return;
  }

  const logger = new ImportLogger();

  // Derive output path from log file path (same name, .json extension, in ./logs/)
  const logPath = logger.getLogFilePath();
  const logBaseName = path.basename(logPath, path.extname(logPath));
  const defaultOutputPath = path.join(process.cwd(), "logs", `${logBaseName}.json`);
  if (!options.output || options.output === `pokemon-sealed-tcgplayer-v2-${Math.floor(Date.now() / 1000)}.json`) {
    options.output = defaultOutputPath;
  }

  logger.log("🚀 Starting TCGPlayer Sealed Product Scraper v2");
  logger.log("================================================");
  logger.log(`Limit: ${options.limit === 0 ? "All products" : options.limit}`);
  logger.log(`Output: ${options.output}`);
  if (options.sets.length > 0) {
    logger.log(`Sets: ${options.sets.join(", ")}`);
  }
  logger.log("================================================\n");


  // ============ PHASE 1: Get all Pokemon sets from TCGdex ============

  let setsToScrape: TcgdexSet[];

  // Fetch all English Pokemon TCG sets from TCGdex (used for name lookup)
  const allTcgdexSets = await fetchTcgdexSets(logger);

  if (options.sets.length > 0) {
    // User specified specific sets by id or name
    setsToScrape = options.sets.map((input) => {
      const lower = input.toLowerCase();
      // Try exact id match first
      const byId = allTcgdexSets.find((s) => s.id === lower);
      if (byId) return byId;
      // Try exact name match
      const byName = allTcgdexSets.find((s) => s.name.toLowerCase() === lower);
      if (byName) return byName;
      // Try partial name match
      const byPartial = allTcgdexSets.find(
        (s) => s.name.toLowerCase().includes(lower) || lower.includes(s.id),
      );
      if (byPartial) return byPartial;
      // Not found in TCGdex — use the raw input as both id and name
      logger.warn(`Set "${input}" not found in TCGdex API. Using raw value.`);
      return { id: lower.replace(/\s+/g, "-"), name: input };
    });
    logger.log(`Using ${setsToScrape.length} user-specified sets`);
  } else {
    // Use all TCGdex sets
    setsToScrape = allTcgdexSets;
    if (setsToScrape.length === 0) {
      logger.error("No sets found. Exiting.");
      logger.close();
      return;
    }
  }

  // ============ PHASE 2: Scrape each set on TCGPlayer ============

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const allProducts: ScrapedProduct[] = [];
  // Global dedup across all sets — track seen tcgplayerIds
  const globalSeenIds = new Set<string>();
  let productsScraped = 0;
  const assumedSealedProducts: string[] = [];

  // Helper to write current progress to the output file incrementally
  function writeIncrementalOutput() {
    const output = {
      metadata: {
        scrapedAt: new Date().toISOString(),
        totalSets: setsToScrape.length,
        totalProducts: allProducts.length,
        inProgress: true,
        source: {
          tcgdex: "https://api.tcgdex.net/v2/en/sets",
          tcgplayer: "https://www.tcgplayer.com/search/all/product",
        },
      },
      products: allProducts,
    };
    fs.writeFileSync(options.output, JSON.stringify(output, null, 2), "utf8");
  }


  try {
    for (const setInfo of setsToScrape) {

      // Check limit before processing set
      if (options.limit > 0 && productsScraped >= options.limit) {
        logger.log(`Reached limit of ${options.limit} products. Stopping.`);
        break;
      }

      logger.log(`\n📦 Processing set: ${setInfo.name} (TCGdex ID: ${setInfo.id})`);

      // Scrape TCGPlayer search results for this set
      const products = await scrapeTcgpSearch(page, setInfo.name, logger);
      logger.log(`  Total products found for set "${setInfo.name}": ${products.length}`);

      if (products.length === 0) {
        logger.log(`  No products found for set "${setInfo.name}", skipping.`);
        continue;
      }

      for (const product of products) {
        // Check limit before each product
        if (options.limit > 0 && productsScraped >= options.limit) {
          break;
        }

        // Skip if we've already scraped this product from another set
        if (globalSeenIds.has(product.tcgplayerId)) {
          continue;
        }
        globalSeenIds.add(product.tcgplayerId);

        // Skip products that contain exclude keywords (e.g. code cards, card dividers, individual cards with rarities)
        const lowerName = product.name.toLowerCase();
        const hasExcludeKeyword = EXCLUDE_KEYWORDS.some((kw) => lowerName.includes(kw));
        if (hasExcludeKeyword) {
          logger.log(`  ⏭️  Excluded: ${product.name} (ID: ${product.tcgplayerId})`);
          continue;
        }

        // Determine which TCGdex set this product belongs to by checking its name
        // against all known set names. This handles cases where TCGPlayer search
        // returns products from other sets (e.g. "Scarlet & Violet Base Set Booster Pack"
        // appearing when searching "Base Set").
        let matchedSet = setInfo;
        const otherSet = allTcgdexSets.find(
          (s) =>
            s.id !== setInfo.id &&
            s.name.toLowerCase() !== setInfo.name.toLowerCase() &&
            lowerName.includes(s.name.toLowerCase()),
        );
        if (otherSet) {
          matchedSet = otherSet;
          logger.log(`  🔀 Reassigned: ${product.name} (from "${setInfo.name}" to "${otherSet.name}")`);
        }

        const parsed = parseProductName(logger, product.name);

        // Track products that were identified via keyword fallback
        if (parsed.listings === -1) {
          assumedSealedProducts.push(`  - ${parsed.name} (ID: ${product.tcgplayerId}, set: ${matchedSet.name})`);
        }

        allProducts.push({
          tcgdexSetId: matchedSet.id,
          tcgdexSetName: matchedSet.name,
          tcgplayerId: product.tcgplayerId,
          name: parsed.name,
          listings: parsed.listings,
          lowest: parsed.lowest,
          market: parsed.market,
          // url: product.url,
        });

        // Write progress to file immediately after determining the product name
        writeIncrementalOutput();

        productsScraped++;
        const logListings = parsed.listings ?? "N/A";
        const logLowest = parsed.lowest ?? "N/A";
        const logMarket = parsed.market ?? "N/A";
        logger.log(`  [${productsScraped}] ${parsed.name} (ID: ${product.tcgplayerId}, set: ${matchedSet.name}, listings: ${logListings}, lowest: ${logLowest}, market: ${logMarket})`);



      }


      // Throttle between sets

      await sleep(jitter(2000, 4000));
    }
  } catch (err) {
    logger.error("Fatal error during scraping", err);
  } finally {
    await browser.close();
  }

  // ============ WRITE FINAL JSON ============

  const output = {
    metadata: {
      scrapedAt: new Date().toISOString(),
      totalSets: setsToScrape.length,
      totalProducts: allProducts.length,
      inProgress: false,
      source: {
        tcgdex: "https://api.tcgdex.net/v2/en/sets",
        tcgplayer: "https://www.tcgplayer.com/search/all/product",
      },
    },
    products: allProducts,
  };

  fs.writeFileSync(options.output, JSON.stringify(output, null, 2), "utf8");


  // ============ SUMMARY ============

  logger.log("\n================================================");
  logger.log("📊 SCRAPE SUMMARY");
  logger.log("================================================");
  logger.log(`✅ Successfully scraped: ${allProducts.length} products`);
  logger.log(`📦 Sets processed: ${setsToScrape.length}`);
  logger.log(`📄 Output file: ${options.output}`);
  logger.log(`📝 Log file: ${logger.getLogFilePath()}`);

  if (assumedSealedProducts.length > 0) {
    logger.log("\n⚠️  Products identified via keyword fallback (pricing extraction failed):");
    for (const item of assumedSealedProducts) {
      logger.log(item);
    }
    logger.log("\n💡 Tip: If any of these are NOT sealed products, add more keywords to SEALED_KEYWORDS.");
    logger.log("   If any are sealed products that should have been parsed correctly, check the parseProductName function.");
  }

  logger.log("================================================\n");


  logger.log("🎉 Scraping completed!");

  logger.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
