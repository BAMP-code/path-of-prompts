import mineralRequirements from "@/data/mineral-requirements.json";
import type { MineralInfo, Mineral } from "@/types/trace";

interface MineralEntry {
  name: string;
  displayName: string;
  role: string;
  primarySourceRegion: string;
  sourceBbox: number[];
}

interface HardwareEntry {
  description: string;
  minerals: MineralEntry[];
}

type MineralRequirementsMap = Record<string, HardwareEntry>;

export function getMineralsForHardware(hardwareGeneration: string): MineralInfo[] {
  const map = mineralRequirements as unknown as MineralRequirementsMap;

  // Try exact match first
  let entry = map[hardwareGeneration];

  // Try partial match
  if (!entry) {
    const key = Object.keys(map).find((k) =>
      hardwareGeneration.toLowerCase().includes(k.toLowerCase()) ||
      k.toLowerCase().includes(hardwareGeneration.toLowerCase())
    );
    if (key) entry = map[key];
  }

  // Default to NVIDIA H100 if unknown
  if (!entry) {
    entry = map["NVIDIA H100"];
  }

  return entry.minerals.map((m): MineralInfo => ({
    name: m.name as Mineral,
    displayName: m.displayName,
    role: m.role,
    primarySourceRegion: m.primarySourceRegion,
    sourceBbox: m.sourceBbox as [number, number, number, number],
  }));
}

export function getHardwareDescription(hardwareGeneration: string): string {
  const map = mineralRequirements as unknown as MineralRequirementsMap;
  return map[hardwareGeneration]?.description ?? `${hardwareGeneration} AI accelerator`;
}
