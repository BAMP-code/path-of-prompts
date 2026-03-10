import type { AquiferFeature } from "@/types/trace";

const USGS_BASE = "https://api.waterdata.usgs.gov/ogcapi/v0";
const LEGACY_BASE = "https://waterservices.usgs.gov/nwis";

interface USGSMonitoringLocation {
  properties: {
    monitoringLocationNumber?: string;
    monitoringLocationName?: string;
    nationalAquiferCode?: string;
    wellDepth?: number;
    decimalLatitude?: number;
    decimalLongitude?: number;
  };
  geometry: {
    coordinates: [number, number];
  };
}

interface USGSResponse {
  features?: USGSMonitoringLocation[];
}

const aquiferCodeNames: Record<string, string> = {
  N100GLCIAL: "Glacial aquifer system",
  N100ALLUVL: "Alluvial aquifers",
  N100PLCSTL: "Piedmont and Blue Ridge crystalline-rock aquifers",
  N100CSDVLL: "Coastal lowlands aquifer system",
  N100ECOAST: "Northern Atlantic Coastal Plain aquifer system",
  N100SCOAST: "Southeast Coastal Plain aquifer system",
  N100MSVLLY: "Mississippi embayment aquifer system",
  N100CNTSTL: "Central Valley aquifer system",
  N400PCFCCS: "Pacific Coast Basin aquifers",
  N100HGHPLN: "High Plains aquifer",
  N100TXGULF: "Texas coastal uplands aquifer system",
  N400BSNRNG: "Basin and Range basin-fill aquifers",
  N100PUGETS: "Puget Sound aquifer system",
  N100WILVAL: "Willamette Lowland basin-fill aquifer system",
  N100COLMBA: "Columbia Plateau basaltic-rock aquifers",
  N100CARBNR: "Carbonate-rock aquifers",
  N100SNDHLS: "Sand and gravel aquifers",
};

export async function fetchNearbyAquifers(
  lat: number,
  lon: number,
  radiusDeg = 1.0
): Promise<AquiferFeature[]> {
  const west = lon - radiusDeg;
  const east = lon + radiusDeg;
  const south = lat - radiusDeg;
  const north = lat + radiusDeg;

  try {
    const url = new URL(`${USGS_BASE}/collections/monitoring-locations/items`);
    url.searchParams.set("f", "json");
    url.searchParams.set("bbox", `${west},${south},${east},${north}`);
    url.searchParams.set("limit", "20");
    url.searchParams.set("properties", "monitoringLocationNumber,monitoringLocationName,nationalAquiferCode,wellDepth,decimalLatitude,decimalLongitude");

    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return await fetchLegacyGroundwater(lat, lon, west, east, south, north);
    }

    const data: USGSResponse = await response.json();
    const features = data.features ?? [];

    return features
      .filter((f) => f.geometry?.coordinates)
      .slice(0, 12)
      .map((f): AquiferFeature => {
        const p = f.properties;
        const [fLon, fLat] = f.geometry.coordinates;
        const aquiferCode = p.nationalAquiferCode;
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [fLon, fLat] },
          properties: {
            siteId: p.monitoringLocationNumber ?? "unknown",
            siteName: p.monitoringLocationName ?? "Unnamed site",
            aquiferCode,
            aquiferName: aquiferCode ? (aquiferCodeNames[aquiferCode] ?? aquiferCode) : undefined,
            wellDepth: p.wellDepth,
            lat: fLat,
            lon: fLon,
          },
        };
      });
  } catch {
    return await fetchLegacyGroundwater(lat, lon, west, east, south, north);
  }
}

async function fetchLegacyGroundwater(
  lat: number,
  lon: number,
  west: number,
  east: number,
  south: number,
  north: number
): Promise<AquiferFeature[]> {
  try {
    const url = new URL(`${LEGACY_BASE}/site/`);
    url.searchParams.set("format", "rdb");
    url.searchParams.set("siteType", "GW");
    url.searchParams.set("bBox", `${west},${south},${east},${north}`);
    url.searchParams.set("siteOutput", "basic");
    url.searchParams.set("hasDataTypeCd", "gw");

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) return [];

    const text = await response.text();
    return parseRdbToAquiferFeatures(text);
  } catch {
    return [];
  }
}

function parseRdbToAquiferFeatures(rdb: string): AquiferFeature[] {
  const lines = rdb.split("\n").filter((l) => !l.startsWith("#") && l.trim());
  if (lines.length < 3) return [];

  const headers = lines[0].split("\t");
  const siteNoIdx = headers.indexOf("site_no");
  const nameIdx = headers.indexOf("station_nm");
  const latIdx = headers.indexOf("dec_lat_va");
  const lonIdx = headers.indexOf("dec_long_va");
  const aquiferIdx = headers.indexOf("nat_aqfr_cd");

  const features: AquiferFeature[] = [];

  for (const line of lines.slice(2)) {
    const cols = line.split("\t");
    const fLat = parseFloat(cols[latIdx]);
    const fLon = parseFloat(cols[lonIdx]);
    if (isNaN(fLat) || isNaN(fLon)) continue;

    const aquiferCode = cols[aquiferIdx]?.trim();
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [fLon, fLat] },
      properties: {
        siteId: cols[siteNoIdx]?.trim() ?? "unknown",
        siteName: cols[nameIdx]?.trim() ?? "Unnamed well",
        aquiferCode,
        aquiferName: aquiferCode ? (aquiferCodeNames[aquiferCode] ?? aquiferCode) : undefined,
        lat: fLat,
        lon: fLon,
      },
    });

    if (features.length >= 12) break;
  }

  return features;
}

export function extractPrimaryAquifer(
  features: AquiferFeature[]
): string | undefined {
  const nameCounts: Record<string, number> = {};
  for (const f of features) {
    const name = f.properties.aquiferName;
    if (name) nameCounts[name] = (nameCounts[name] ?? 0) + 1;
  }
  const sorted = Object.entries(nameCounts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0];
}
