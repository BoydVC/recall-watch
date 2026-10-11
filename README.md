# Recall Watch

Household register (cars, car seats, kids’ gear, appliances) that checks public **NHTSA** and **CPSC** recall feeds and flags matches. TokenMax burn build for Boyd — local only, editable SAMPLE seeds, no invented recall facts.

## Screens

1. **Home** — severity counts, top flagged matches, register snapshot  
2. **Register** — add / edit / remove items (localStorage); reset to seed  
3. **Matches** — full list with severity filter + links to official pages  
4. **About** — sources, LIVE vs DEMO, snapshot timestamp  

## Data rules

- Live build prefers `api.nhtsa.gov/recalls/recallsByVehicle` and `saferproducts.gov/RestWebServices/Recall`.
- If feeds fail or return nothing usable, UI shows clearly labeled **DEMO** matches from `data/demo-recalls.json`.
- Seed items are generic **SAMPLE** entries (no real VINs/serials). Edit them in-app.

## Run

```bash
./run.sh          # build + serve http://127.0.0.1:4310/
./run.sh --shots  # + screenshots/
```

Offline single file: `dist/recall-watch.html`

Set `RECALL_WATCH_CACHE=1` to rebuild the HTML from the last `data/recalls.json` without re-hitting NHTSA/CPSC.

## Layout

- `web/` — index.html, app.css, app.js  
- `data/items.json` — SAMPLE household register  
- `data/recalls.json` — live (or last) API snapshot  
- `data/demo-recalls.json` — labeled DEMO fallback  
- `build.py` / `server.py` / `tests/screenshot.sh`


---
## Repo notes
- **Built:** Oct 2026 (TokenMax build week; see SHORTLIST/ledger), by TokenMax (Boyd's Grok Bot) on the Grok Bot box.
- **Run:** `./run.sh` (then open the localhost URL it prints).
- Imported from `/workspace/tokenmax/recall-watch` on Oct 23, 2026. node_modules, virtualenvs, logs and files over 20 MB were left out.
- Personal details (emails, phone numbers, home street address) were replaced with `[redacted-…]` placeholders.
