import cloudRegions from "@/data/cloud-regions.json";
import type { DataCenterNode, Provider } from "@/types/trace";

type CloudRegionEntry = {
  id: string;
  name: string;
  provider: string;
  region: string;
  lat: number;
  lon: number;
  hardwareGeneration: string;
  territory: string;
  country: string;
};

type CloudRegionMap = {
  [key: string]: CloudRegionEntry;
};

export function lookupDataCenter(
  provider: Provider,
  model: string
): DataCenterNode {
  const providerRegions = cloudRegions[provider] as CloudRegionMap | undefined;
  if (!providerRegions) {
    return getFallback(provider);
  }

  // Normalize model name to find best match
  const modelKey = normalizeModelKey(model, providerRegions);
  const entry = providerRegions[modelKey] ?? providerRegions["default"];

  if (!entry) {
    return getFallback(provider);
  }

  return {
    id: entry.id,
    name: entry.name,
    provider: entry.provider,
    region: entry.region,
    lat: entry.lat,
    lon: entry.lon,
    hardwareGeneration: entry.hardwareGeneration,
    territory: entry.territory,
    country: entry.country,
  };
}

function normalizeModelKey(
  model: string,
  regions: CloudRegionMap
): string {
  const lower = model.toLowerCase();

  // Try exact match first
  if (regions[lower]) return lower;

  // Try prefix match
  for (const key of Object.keys(regions)) {
    if (key !== "default" && lower.startsWith(key)) return key;
  }

  // Try partial match
  for (const key of Object.keys(regions)) {
    if (key !== "default" && lower.includes(key.replace("gpt-", "").replace("claude-", ""))) return key;
  }

  return "default";
}

function getFallback(provider: Provider): DataCenterNode {
  if (provider === "openai") {
    return {
      id: "azure-eastus",
      name: "Microsoft Azure — East US (Virginia)",
      provider: "Microsoft Azure",
      region: "eastus",
      lat: 37.3719,
      lon: -79.8164,
      hardwareGeneration: "NVIDIA H100",
      territory: "Virginia, United States",
      country: "US",
    };
  }
  return {
    id: "aws-us-east-1",
    name: "Amazon Web Services — US East 1 (N. Virginia)",
    provider: "Amazon Web Services",
    region: "us-east-1",
    lat: 38.9458,
    lon: -77.4975,
    hardwareGeneration: "AWS Trainium2",
    territory: "Northern Virginia, United States",
    country: "US",
  };
}
