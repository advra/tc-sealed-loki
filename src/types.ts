
/** 
 *  Catalog Engine (internal type defined) which references tcgdex sets 
*/
export type TcgdexSet = {
  id: string;
  name: string;
};

export type TcgpProduct = {
  tcgplayerId: string;
  name: string;
  url?: string;
};

/** 
 * The data to look for when scraping a product
 * name - Clean product name without set prefix, listings, or pricing
 * listings - number of listings (undefined if not availible)
 * lowest - listing price formatted as "2.99" undefined if not availible
 * market - market price formatted as "2.99" undefined if not availible
*/
export type ParsedProductInfo = {
  name: string;
  listings: number | undefined;
  lowest: string | undefined;
  market: string | undefined;

};

export type ScrapedProduct = {
  tcgdexSetId: string;
  tcgdexSetName: string;
  tcgplayerId: string;
  name: string;
  listings: number | undefined;
  lowest: string | undefined;
  market: string | undefined;
  url?: string;
};

// ============ Product Price by Condition Types ============

export type ProductCondition = "NM" | "LP" | "MP" | "HP" | "DMG";

export type ConditionPrice = {
  condition: ProductCondition;
  marketPrice: string | undefined;
  listedPrice: string | undefined;
  listings: number | undefined;
};

export type ScrapedProductPrices = {
  tcgplayerId: string;
  productName: string;
  scrapedAt: string;
  prices: ConditionPrice[];
};
