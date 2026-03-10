# The Ancestry Map

A real-time ethical audit of Large Language Model infrastructure. Enter any prompt and trace its physical ancestry across a global map — identifying the specific territories, water tables, and mineral sources required to generate your query.

## What it does

1. Sends your prompt to a real LLM API (OpenAI or Anthropic)
2. Infers which data center likely processed it based on known cloud infrastructure
3. Queries the USGS Water Data API for groundwater monitoring sites near that data center
4. Queries the USGS Mineral Resources Data System (MRDS) for mineral deposits in the supply chain regions of the hardware that runs the model
5. Renders all of this on a Mapbox GL map with animated arcs, aquifer overlays, and mineral deposit markers

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

| Variable | Description | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox GL JS public token | [account.mapbox.com](https://account.mapbox.com) — free tier available |
| `OPENAI_API_KEY` | OpenAI API key | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `ANTHROPIC_API_KEY` | Anthropic API key | [console.anthropic.com/settings/api-keys](https://console.anthropic.com/settings/api-keys) |

Both LLM keys are optional — the app will display an error only when you attempt to use that provider.

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

```
User Prompt → /api/trace (SSE stream)
    ├── LLM API (OpenAI / Anthropic)          → Phase 1: token stream
    ├── datacenter-lookup.ts                   → Inferred DC coordinates
    ├── usgs-water.ts → USGS OGC API           → Nearby groundwater wells
    └── usgs-minerals.ts → USGS MRDS API       → Mineral deposits by supply chain region
         ↓
    GeoJSON FeatureCollection                  → Phase 2: infrastructure
    AuditReport                                → Phase 3: structured audit
         ↓
Mapbox GL + deck.gl
    ├── ArcLayer        — animated prompt path (user → data center)
    ├── ScatterplotLayer — aquifer monitoring sites (blue)
    └── ScatterplotLayer — mineral deposits (colored by category)
```

## Data sources

- **Water data**: [USGS Water Data API](https://api.waterdata.usgs.gov) — US groundwater monitoring network
- **Mineral deposits**: [USGS Mineral Resources Data System (MRDS)](https://mrdata.usgs.gov/mrds/) — global mineral occurrence database
- **Cloud regions**: Community-maintained mapping of Azure/AWS region names to coordinates
- **Hardware → minerals**: Derived from [USGS Mineral Commodity Summaries](https://www.usgs.gov/centers/national-minerals-information-center/commodity-statistics-and-information) (annual)

## Methodology transparency

Data center routing is **inferred**, not directly measured. Neither OpenAI nor Anthropic exposes which physical facility handles individual API requests. The location lookup is based on publicly known cloud partnership agreements (OpenAI → Azure, Anthropic → AWS) and regional deployment documentation. This limitation is disclosed in every audit report.

## Deploy to Vercel

```bash
vercel deploy
```

Add the three environment variables in the Vercel dashboard under Project Settings → Environment Variables.
