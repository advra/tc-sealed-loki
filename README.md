## tc-sealed-loki

## Usage

### Sealed Product Scraper

Scrapes TCGPlayer for sealed Pokemon products by set.

```bash
  npx tsx src/scraper/scrape-tcgp-sealed.ts
```

Options:
```bash
  --limit <number>   Max products to scrape (0 = all, useful for testing e.g. --limit 1)
  --output <path>    Output JSON file path (default: pokemon-sealed-tcgplayer-v2-<timestamp>.json)
  --set <name>       Only scrape a specific set by TCGdex name (can be used multiple times, e.g. --set "151")
```

Examples:
```bash
  npx tsx src/scraper/scrape-tcgp-sealed.ts --limit 1
  npx tsx src/scraper/scrape-tcgp-sealed.ts --set "151"
  npx tsx src/scraper/scrape-tcgp-sealed.ts --set "151" --set "Scarlet & Violet"
  npx tsx src/scraper/scrape-tcgp-sealed.ts --limit 50 --output test-output.json
```

### Product Price Scraper (product-loki)

Scrapes TCGPlayer product prices broken down by card condition (NM, LP, MP, HP, DMG).

```bash
  npx tsx src/scraper/scrape-tcgp-product.ts <tcgplayerId>
```

Options:
```bash
  --output <path>    Output JSON file path (default: stdout)
```

Examples:
```bash
  npx tsx src/scraper/scrape-tcgp-product.ts 94147
  npx tsx src/scraper/scrape-tcgp-product.ts 94147 --output prices.json
```

Or using the npm script:
```bash
  npm run product -- 94147
  npm run product -- 94147 --output prices.json
```

## Other Notes

Refer to full output archived in [/example-out](/example-output)
