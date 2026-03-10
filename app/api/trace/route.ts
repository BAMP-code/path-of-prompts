import { NextRequest } from "next/server";
import { streamOpenAI, OPENAI_DEFAULT_MODEL } from "@/lib/llm/openai";
import { streamAnthropic, ANTHROPIC_DEFAULT_MODEL } from "@/lib/llm/anthropic";
import { lookupDataCenter } from "@/lib/infrastructure/datacenter-lookup";
import { fetchNearbyAquifers, extractPrimaryAquifer } from "@/lib/infrastructure/usgs-water";
import { fetchMineralDeposits } from "@/lib/infrastructure/usgs-minerals";
import { getMineralsForHardware } from "@/lib/knowledge-graph/hardware-minerals";
import type {
  Provider,
  SSEEvent,
  InfrastructureGeoJSON,
  AuditReport,
  DataCenterGeoFeature,
} from "@/types/trace";

// Simple in-memory cache with TTL
const cache = new Map<string, { data: unknown; expires: number }>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T, ttlMs = 3600_000) {
  cache.set(key, { data, expires: Date.now() + ttlMs });
}

function encode(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token
  return Math.ceil(text.length / 4);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prompt, provider = "openai" } = body as {
    prompt: string;
    provider: Provider;
  };

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return new Response(
      encode({ type: "error", message: "No prompt provided" }),
      { status: 400 }
    );
  }

  const model =
    provider === "anthropic" ? ANTHROPIC_DEFAULT_MODEL : OPENAI_DEFAULT_MODEL;
  const dataCenter = lookupDataCenter(provider, model);

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: SSEEvent) => {
        controller.enqueue(new TextEncoder().encode(encode(event)));
      };

      try {
        // Phase 1: Stream LLM response
        const llmStream =
          provider === "anthropic"
            ? streamAnthropic(prompt, model)
            : streamOpenAI(prompt, model);

        // Start infrastructure enrichment concurrently
        const infraPromise = enrichInfrastructure(dataCenter);

        for await (const chunk of llmStream) {
          enqueue({ type: "llm_chunk", content: chunk });
        }

        // Phase 2: Send infrastructure GeoJSON
        const { geojson, waterSystems, mineralResults } = await infraPromise;

        enqueue({ type: "infrastructure", geojson, dataCenter });

        // Phase 3: Send audit report
        const minerals = getMineralsForHardware(dataCenter.hardwareGeneration);
        const primaryAquifer = extractPrimaryAquifer(
          waterSystems.map((ws) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [ws.lon, ws.lat] as [number, number] },
            properties: ws,
          }))
        );

        const report: AuditReport = {
          promptTokenEstimate: estimateTokens(prompt),
          provider,
          model,
          inferredDataCenter: {
            ...dataCenter,
            waterSystem: primaryAquifer,
          },
          territory: dataCenter.territory,
          waterSystems: waterSystems.map((ws) => ({
            siteName: ws.siteName,
            aquiferName: ws.aquiferName,
            siteId: ws.siteId,
            lat: ws.lat,
            lon: ws.lon,
          })),
          minerals: minerals.map((m) => ({
            mineral: m.name,
            displayName: m.displayName,
            role: m.role,
            primarySourceRegion: m.primarySourceRegion,
            depositsFound:
              mineralResults.find((r) => r.mineral === m.name)
                ?.depositsFound ?? 0,
          })),
          methodology: buildMethodologyText(provider, model, dataCenter.id),
          timestamp: new Date().toISOString(),
        };

        enqueue({ type: "audit", report });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unexpected error";
        enqueue({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function enrichInfrastructure(dataCenter: {
  id: string;
  name: string;
  provider: string;
  region: string;
  lat: number;
  lon: number;
  hardwareGeneration: string;
  territory: string;
  country: string;
}) {
  const minerals = getMineralsForHardware(dataCenter.hardwareGeneration);

  // Cache key for water data
  const waterCacheKey = `water:${dataCenter.lat.toFixed(1)}:${dataCenter.lon.toFixed(1)}`;
  let aquiferFeatures = getCached<Awaited<ReturnType<typeof fetchNearbyAquifers>>>(waterCacheKey);

  if (!aquiferFeatures) {
    aquiferFeatures = await fetchNearbyAquifers(dataCenter.lat, dataCenter.lon);
    setCache(waterCacheKey, aquiferFeatures);
  }

  // Fetch mineral deposits in parallel
  const mineralFetches = await Promise.allSettled(
    minerals.map(async (m) => {
      const cacheKey = `minerals:${m.name}:${m.sourceBbox.join(",")}`;
      let deposits = getCached<Awaited<ReturnType<typeof fetchMineralDeposits>>>(cacheKey);
      if (!deposits) {
        deposits = await fetchMineralDeposits(m.name, m.sourceBbox);
        setCache(cacheKey, deposits);
      }
      return { mineral: m.name, deposits };
    })
  );

  const mineralResults: { mineral: string; depositsFound: number }[] = [];
  const allMineralFeatures: InfrastructureGeoJSON["features"] = [];

  for (const result of mineralFetches) {
    if (result.status === "fulfilled") {
      mineralResults.push({
        mineral: result.value.mineral,
        depositsFound: result.value.deposits.length,
      });
      allMineralFeatures.push(...result.value.deposits);
    }
  }

  // Build data center feature
  const dcFeature: DataCenterGeoFeature = {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [dataCenter.lon, dataCenter.lat],
    },
    properties: {
      kind: "datacenter",
      id: dataCenter.id,
      name: dataCenter.name,
      provider: dataCenter.provider,
      region: dataCenter.region,
      hardware: dataCenter.hardwareGeneration,
      territory: dataCenter.territory,
    },
  };

  const geojson: InfrastructureGeoJSON = {
    type: "FeatureCollection",
    features: [dcFeature, ...aquiferFeatures, ...allMineralFeatures],
  };

  const waterSystems = aquiferFeatures.map((f) => f.properties);

  return { geojson, waterSystems, mineralResults };
}

function buildMethodologyText(
  provider: Provider,
  model: string,
  dataCenterId: string
): string {
  return [
    `This audit was generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.`,
    `The prompt was sent to ${provider === "openai" ? "OpenAI" : "Anthropic"} using the ${model} model.`,
    `Data center location is inferred from the provider's known infrastructure — neither OpenAI nor Anthropic publicly exposes which physical facility handles individual requests. The mapping is based on published cloud partnership agreements and regional deployment documentation.`,
    `Water monitoring data is sourced from the U.S. Geological Survey Water Data API (api.waterdata.usgs.gov). Coverage is limited to the continental United States.`,
    `Mineral deposit data is sourced from the USGS Mineral Resources Data System (MRDS), a global inventory of mineral occurrences maintained by the USGS National Minerals Information Center.`,
    `The link between hardware models and specific minerals is derived from USGS Mineral Commodity Summaries (annual) and peer-reviewed life-cycle assessment literature. It reflects typical material composition, not supplier-specific sourcing data.`,
  ].join(" ");
}
