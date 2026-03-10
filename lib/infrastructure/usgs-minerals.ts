import type { MineralDepositFeature, Mineral } from "@/types/trace";
import curatedDeposits from "@/data/mineral-deposits.json";

interface CuratedDeposit {
  name: string;
  lon: number;
  lat: number;
  country: string;
  status: string;
  note?: string;
}

type CuratedMap = Record<string, CuratedDeposit[]>;

/**
 * Returns mineral deposit features from the curated dataset.
 * This is the primary source — the MRDS API blocks server-side requests (403).
 */
export async function fetchMineralDeposits(
  mineral: Mineral,
  _bbox: [number, number, number, number]
): Promise<MineralDepositFeature[]> {
  const map = curatedDeposits as CuratedMap;
  const deposits = map[mineral] ?? [];

  return deposits.map((d): MineralDepositFeature => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [d.lon, d.lat] },
    properties: {
      mrdsId: `curated-${mineral}-${d.name.replace(/\s+/g, "-").toLowerCase()}`,
      name: d.name,
      commodity: mineral,
      mineral,
      country: d.country,
      status: d.status,
      depositType: d.note,
    },
  }));
}

export function getMrdsUrl(mineralName: string): string {
  return `https://mrdata.usgs.gov/mrds/search-by-name.php?q=${encodeURIComponent(mineralName)}`;
}
