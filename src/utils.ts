import { ImportLogger } from "./logger/import-logger";
import { ParsedProductInfo } from "./types";

export const sleep = (ms: number) => {
  return new Promise((r) => setTimeout(r, ms));
}

/** Random delay between min and max ms 
 * @param min min sleep time
 * @param max max sleep time
*/
export const jitter = (min = 800, max = 2000) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/*
  extract productId (the tcgpid) from tcgplayer.com/product/#########
*/
export const extractProductId = (url: string): string => {
  const match = url.match(/\/product\/(\d+)/);
  return match?.[1] ?? "";
}

export const toFullUrl = (href: string): string => {
  if (href.startsWith("http")) return href;
  return `https://www.tcgplayer.com${href.startsWith("/") ? "" : "/"}${href}`;
}

/**
 * Parse a TCGPlayer product name into its components.
 *
 * Input format:
 *   "SV10: Destined RivalsDestined Rivals Booster Pack90 listings from $2.99Market Price:$10.52"
 *   "ME: Ascended HeroesAscended Heroes Elite Trainer Box197 listings from $1.00Market Price:$182.90"
 *   "Miscellaneous Cards & ProductsCostco Pokemon Collector 3-Pack...6 listings from $999.01Market Price:$784.58"
 *
 * The pattern is:
 *   [optional set prefix][product name][listings count] listings from [lowest price]Market Price:[market price]
 *
 * We extract:
 *   - name: clean product name (everything between the set prefix and " listings from")
 *   - listings: number of listings
 *   - lowest: lowest price string
 *   - market: market price string
 */
export const parseProductName = (logger: ImportLogger, rawName: string): ParsedProductInfo => {
  // Default values
  let name = rawName;
  let listings = 0;
  let lowest;
  let market;

  // Extract pricing: "X listings from $Y.Market Price:$Z"
  // The pattern is: <listings> listings from <lowest>Market Price:<market>
  // Note: "listings" can be singular "listing" (e.g. "1 listing from $X")
  const pricingMatch = rawName.match(
    /(\d+)\s+listings?\s+from\s+(\$[\d,]+\.?\d*)\s*Market\s*Price:\s*(\$[\d,]+\.?\d*)/i,
  );
  if (pricingMatch) {
    listings = Number.parseInt(pricingMatch[1] ?? "0", 10);
    lowest = (pricingMatch[2] ?? "").replace(/^\$/, "");
    market = (pricingMatch[3] ?? "").replace(/^\$/, "");


    // Remove the pricing suffix from the name
    name = name.replace(
      /\d+\s+listings?\s+from\s+\$[\d,]+\.?\d*\s*Market\s*Price:\s*\$[\d,]+\.?\d*/i,
      "",
    ).trim();
  }

  // Handle "X listings from $Y Market Price Unavailable" (has listings + lowest, but no market price)
  // e.g. "Jungle Jungle Booster Box [Unlimited Edition]2 listings from $34,400.00 Market Price Unavailable"
  let listingsOnlyMatch: RegExpMatchArray | null = null;
  if (!pricingMatch) {
    listingsOnlyMatch = rawName.match(
      /(\d+)\s+listings?\s+from\s+(\$[\d,]+\.?\d*)\s*Market\s*Price\s+Unavailable/i,
    );
    if (listingsOnlyMatch) {
      listings = Number.parseInt(listingsOnlyMatch[1] ?? "0", 10);
      lowest = (listingsOnlyMatch[2] ?? "").replace(/^\$/, "");
      market = undefined;

      // Remove the "X listings from $Y Market Price Unavailable" suffix
      name = name.replace(
        /\d+\s+listings?\s+from\s+\$[\d,]+\.?\d*\s*Market\s*Price\s+Unavailable/i,
        "",
      ).trim();
    }
  }

  // Handle "Out of Stock" products that have no listing count
  // e.g. "...Out of Stock Market Price:$1.21"
  // e.g. "...Out of Stock Market Price Unavailable"
  let oosMatch: RegExpMatchArray | null = null;
  if (!pricingMatch && !listingsOnlyMatch) {

    // First try: "Out of Stock Market Price:$X" (with a price)
    oosMatch = rawName.match(
      /Out\s+of\s+Stock\s*Market\s*Price:\s*(\$[\d,]+\.?\d*)/i,
    );
    if (oosMatch) {
      market = (oosMatch[1] ?? "").replace(/^\$/, "");
      listings = 0;
      lowest = "";

      // Remove the "Out of Stock Market Price:$X" suffix
      name = name.replace(
        /Out\s+of\s+Stock\s*Market\s*Price:\s*\$[\d,]+\.?\d*/i,
        "",
      ).trim();
    } else {
      // Second try: "Out of Stock Market Price Unavailable" (no price)
      const oosUnavailableMatch = rawName.match(
        /Out\s+of\s+Stock\s*Market\s*Price\s+Unavailable/i,
      );
      if (oosUnavailableMatch) {
        listings = 0;
        lowest = undefined;
        market = undefined;

        // Remove the "Out of Stock Market Price Unavailable" suffix
        name = name.replace(
          /Out\s+of\s+Stock\s*Market\s*Price\s+Unavailable/i,
          "",
        ).trim();
      }
    }
  }

  // Remove set prefix like "SV10: Destined RivalsDestined Rivals " -> "Destined Rivals "

  // The pattern is: <set prefix><set name repeated><product name>
  // We want to strip the set prefix and the repeated set name
  // Strategy: look for a colon followed by text that repeats
  const colonMatch = name.match(/^[A-Za-z0-9]+:\s*(.+)$/);
  if (colonMatch && colonMatch[1]) {
    const afterColon = colonMatch[1];
    // Check if the text after colon starts with a repeat of the set name
    // e.g. "Destined RivalsDestined Rivals Booster Pack"
    // The set name repeats immediately - find the split point
    const repeatMatch = afterColon.match(/^(.+?)\1/);
    if (repeatMatch) {
      // Remove the repeated prefix, keep the rest
      name = afterColon.slice((repeatMatch[1] ?? "").length).trim();
    } else {
      name = afterColon.trim();
    }
  }

  // Handle "Scarlet & Violet 151Sam's Club..." or "Scarlet & Violet 151151 Pokemon Center..."
  // where the set name "Scarlet & Violet 151" appears without a colon prefix
  // Look for patterns like "Scarlet & Violet 151" followed by the same text or product name
  const sv151Match = name.match(/^(Scarlet\s*&\s*Violet\s*151)\s*(.+)$/i);
  if (sv151Match && sv151Match[1] && sv151Match[2]) {
    const setPart = sv151Match[1];
    const rest = sv151Match[2];
    // Check if the rest starts with the same set part (e.g. "151151")
    if (rest.toLowerCase().startsWith("151")) {
      name = rest.slice(3).trim(); // Remove the duplicate "151"
    } else {
      name = rest.trim();
    }
  }

  // Handle "Pokemon Card 151NonePokemon Card 151 Card File Set..."
  // where "None" appears as a separator
  name = name.replace(/None(?=[A-Z])/g, " ").trim();

  // Handle repeated text like "Pokemon Card 151 Pokemon Card 151 Card File Set"
  // where the same phrase appears twice consecutively
  const repeatPhraseMatch = name.match(/^(.{10,}?)\s*\1/);
  if (repeatPhraseMatch) {
    name = name.slice((repeatPhraseMatch[1] ?? "").length).trim();
  }

  // Insert missing spaces at word boundaries where text is concatenated
  // e.g. "Pokemon International Card DividersDestined Rivals" -> "Pokemon International Card Dividers Destined Rivals"
  // e.g. "Destined RivalsCode Card" -> "Destined Rivals Code Card"
  // e.g. "Destined RivalsUncommon" -> "Destined Rivals Uncommon"
  // Pattern: lowercase letter, digit, or ']' followed by uppercase letter (no space between)
  name = name.replace(/([a-z0-9\]])([A-Z])/g, "$1 $2");

  // Also handle "Out of Stock" that may now be separated from preceding text
  // e.g. "...Card Divider Out of Stock" -> already has spaces, but ensure clean
  name = name.replace(/\s+Out\s+of\s+Stock\s*/gi, " Out of Stock ").trim();

  // Strip set name prefix when it appears before known product type keywords
  // (handles cases where set name is concatenated without a colon separator)
  // e.g. "Destined Rivals Code Card..." -> "Code Card..."
  // e.g. "Destined Rivals Uncommon, #047/182..." -> "Uncommon, #047/182..."
  // e.g. "Destined Rivals Common, #094/182..." -> "Common, #094/182..."
  // e.g. "Destined Rivals Rare, #049/182..." -> "Rare, #049/182..."
  // e.g. "Destined Rivals Double Rare, #081/182..." -> "Double Rare, #081/182..."
  const setPrefixMatch = name.match(
    /^[A-Za-z][A-Za-z\s&]+?(?=\s+(?:Code\s+Card|Common|Uncommon|Rare|Double\s+Rare|Ultra\s+Rare|Hyper\s+Rare|Illustration\s+Rare|Special\s+Illustration\s+Rare)\b)/i,
  );
  if (setPrefixMatch) {
    name = name.slice(setPrefixMatch[0].length).trim();
  }

  // Also handle "Miscellaneous Cards & Products" prefix

  // e.g. "Miscellaneous Cards & ProductsCostco Pokemon Collector 3-Pack..."
  const miscMatch = name.match(/^Miscellaneous\s+Cards\s*&\s*Products(.+)$/i);
  if (miscMatch && miscMatch[1]) {
    name = miscMatch[1].trim();
  }

  // Handle "Code Card" prefix
  // e.g. "Code CardCode Card - Ascended Heroes Booster Pack"
  const codeCardMatch = name.match(/^Code\s+Card(.+)$/i);
  if (codeCardMatch && codeCardMatch[1]) {
    name = codeCardMatch[1].replace(/^Code\s+Card\s*[-–]\s*/i, "").trim();
  }


  // Clean up any remaining oddities
  name = name.replace(/\s+/g, " ").trim();

  // Fallback: if pricing extraction failed (no listings/market found),
  // check if the name contains sealed product keywords.
  // This catches products where the TCGPlayer name format is unexpected.
  if (!pricingMatch && !listingsOnlyMatch && !oosMatch) {

    const lowerName = name.toLowerCase();
    const matchedKeyword = SEALED_KEYWORDS.find((kw) => lowerName.includes(kw));
    if (matchedKeyword) {
      // Mark as assumed sealed product — set listings to -1 and clear pricing
      // (caller can check listings === -1 to identify fallback matches)
      listings = -1;
      lowest = undefined;
      market = undefined;
      logger.log(`attempting to find name... found! ${lowerName}`);
    } else {
      logger.log("attempting to find name... failed!");
    }
  }


  return { name, listings, lowest, market };

}