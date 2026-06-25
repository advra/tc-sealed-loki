## TC Sealed tc-sealed-loki

## Usage

```bash
  npx tsx src/scraper/scrape-tcgp-sealed.ts
```
Running the script with with additional configs:
Options:
  --limit <number>   Max products to scrape (0 = all, useful for testing e.g. --limit 1)
  --output <path>    Output JSON file path (default: pokemon-sealed-tcgplayer-v2-<timestamp>.json)
  --set <name>       Only scrape a specific set by TCGdex name (can be used multiple times, e.g. --set "151")

Examples:
```bash
  npx tsx src/scraper/scrape-tcgp-sealed.ts --limit 1
  npx tsx src/scraper/scrape-tcgp-sealed.ts --set "151"
  npx tsx src/scraper/scrape-tcgp-sealed.ts --set "151" --set "Scarlet & Violet"
  npx tsx src/scraper/scrape-tcgp-sealed.ts --limit 50 --output test-output.json
```