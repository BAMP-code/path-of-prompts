export type Provider = "openai" | "anthropic";

export type Phase = "landing" | "animating" | "result";

export type Mineral =
  | "neodymium"
  | "cobalt"
  | "tantalum"
  | "gallium"
  | "germanium"
  | "silicon"
  | "copper"
  | "lithium"
  | "indium"
  | "dysprosium"
  | "terbium"
  | "praseodymium"
  | "lanthanum";

export interface MineralInfo {
  name: Mineral;
  displayName: string;
  role: string;
  primarySourceRegion: string;
  sourceBbox: [number, number, number, number]; // [west, south, east, north]
}

export interface DataCenterNode {
  id: string;
  name: string;
  provider: string;
  region: string;
  lat: number;
  lon: number;
  hardwareGeneration: string;
  territory: string;
  country: string;
  waterSystem?: string;
}

export interface AquiferFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    siteId: string;
    siteName: string;
    aquiferCode?: string;
    aquiferName?: string;
    wellDepth?: number;
    lat: number;
    lon: number;
  };
}

export interface MineralDepositFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    mrdsId: string;
    name: string;
    commodity: string;
    mineral: Mineral;
    country?: string;
    status?: string;
    depositType?: string;
  };
}

export interface InfrastructureGeoJSON {
  type: "FeatureCollection";
  features: (AquiferFeature | MineralDepositFeature | DataCenterGeoFeature)[];
}

export interface DataCenterGeoFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    kind: "datacenter";
    id: string;
    name: string;
    provider: string;
    region: string;
    hardware: string;
    territory: string;
  };
}

export interface AuditReport {
  promptTokenEstimate: number;
  provider: Provider;
  model: string;
  inferredDataCenter: DataCenterNode;
  territory: string;
  waterSystems: {
    siteName: string;
    aquiferName?: string;
    siteId: string;
    lat: number;
    lon: number;
  }[];
  minerals: {
    mineral: Mineral;
    displayName: string;
    role: string;
    primarySourceRegion: string;
    depositsFound: number;
  }[];
  methodology: string;
  timestamp: string;
}

export type SSEEvent =
  | { type: "llm_chunk"; content: string }
  | { type: "infrastructure"; geojson: InfrastructureGeoJSON; dataCenter: DataCenterNode }
  | { type: "audit"; report: AuditReport }
  | { type: "error"; message: string };
