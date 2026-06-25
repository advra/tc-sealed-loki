
/**
 * Keywords used as fallback to identify sealed products when pricing extraction fails.
 * If a product name contains any of these (case-insensitive), it's assumed to be a sealed product that we can add
 */
const SEALED_KEYWORDS = [
  "box",
  "pack",
  "elite trainer",
  "booster",
  "bundle",
  "sealed",
  "case",
  "blister",
  "checklane",
  "tin",
  "sleeved",
  "fun pack",
  "build & battle",
  "premium",
  "collection",
  "display",
  "pouch",
  "portfolio",
  "binder",
  "sleeve",
  "divider",
  "storage",
  "art bundle",
  "etb",
  "booster box",
  "booster pack",
  "booster bundle",
  "tin display",
  "battle deck",
  "2-pack",
  "3-pack",
  "costco",
  "sam's club",
  "collector chest",
  "adventure chest",
  "spc",
  "super-premium",
  "super-premium collection",
  "knock out collection",
  "holiday calendar",
  "prize pack",
  "first partner",
  "toolkit",
  "tournament collection box",
  "showcase",
  "pokeball collection"
];

/**
 * Keywords that indicate a product is NOT a sealed product and should be excluded.
 * If a product name contains any of these (case-insensitive), it will be skipped.
 */
const EXCLUDE_KEYWORDS = [
  // although these are products its not sealed so we dont care about these
  "code card",
  "card divider",
  "card sleeves",
  // tcgp provides rarities on card titles so we assume the listing is a card and not a sealed product 
  "common",
  "uncommon",
  "rare",
  "double rare",
  "ultra rare",
  "hyper rare",
  "illustration rare",
  "special illustration rare",
  "promo",
  "jumbo cards promo",
];