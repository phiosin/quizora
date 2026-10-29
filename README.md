# 🧭 Quizora

An ad-free, mobile-first quiz duel game in the browser. Challenge a friend with a code or link, each of you vetoes a category, then you both play the same 3 rounds whenever you like.

**Play:** https://phiosin.github.io/quizora/

## Categories (22)
- **Maps**: US states, European / World / African / Asian / American countries, European rivers. Two modes: *name the red ones* (type) and *find it* (tap).
- **Capitals**: World, Europe, Asia, Africa, Americas (multiple choice)
- **Trivia**: 10 categories from [The Trivia API](https://the-trivia-api.com)

Difficulty: Easy / Medium / Hard / Very hard, or rising per round.

## Development
```bash
npm install
npm run dev
```
Without Supabase settings the app runs in **local mode** (duels only work inside one browser, which is handy for testing).

### Supabase (online duels)
1. Create a free project at https://supabase.com
2. SQL Editor → paste and run [`supabase/schema.sql`](supabase/schema.sql)
3. Copy `.env.example` to `.env.local` and fill in URL + anon/publishable key
4. For the deployed site, set the same two values as GitHub repo **variables** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)

### Map data
Pre-built map files live in `public/data/`. To rebuild them, download the Natural Earth river files into `scripts/raw/`:
```bash
curl -o scripts/raw/ne_10m_rivers_lake_centerlines.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson
curl -o scripts/raw/ne_10m_rivers_europe.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_europe.geojson
npm run data
```
Map data: Natural Earth (public domain), us-atlas / world-atlas (ISC), world-countries (ODbL).
