"use client";

import { useRef, useEffect } from "react";
import type { AuditReport, DataCenterNode } from "@/types/trace";

interface AuditPanelProps {
  llmResponse: string;
  isStreaming: boolean;
  report: AuditReport | null;
  dataCenter: DataCenterNode | null;
  isLoading: boolean;
  onStay: () => void;
  onNewTrace: () => void;
}

const MINERAL_CLASS: Record<string, string> = {
  neodymium: "mineral-rare-earth",
  dysprosium: "mineral-rare-earth",
  terbium: "mineral-rare-earth",
  praseodymium: "mineral-rare-earth",
  lanthanum: "mineral-rare-earth",
  cobalt: "mineral-conflict",
  tantalum: "mineral-conflict",
  gallium: "mineral-specialty",
  germanium: "mineral-specialty",
  indium: "mineral-specialty",
  silicon: "mineral-industrial",
  copper: "mineral-industrial",
  lithium: "mineral-battery",
};

const MINERAL_CATEGORY: Record<string, string> = {
  neodymium: "Rare Earth",
  dysprosium: "Rare Earth",
  terbium: "Rare Earth",
  praseodymium: "Rare Earth",
  lanthanum: "Rare Earth",
  cobalt: "Conflict Mineral",
  tantalum: "Conflict Mineral",
  gallium: "Specialty",
  germanium: "Specialty",
  indium: "Specialty",
  silicon: "Industrial",
  copper: "Industrial",
  lithium: "Battery",
};

export default function AuditPanel({
  llmResponse,
  isStreaming,
  report,
  dataCenter,
  isLoading,
  onStay,
  onNewTrace,
}: AuditPanelProps) {
  const responseRef = useRef<HTMLDivElement>(null);
  const visible = isLoading || llmResponse || report || dataCenter;

  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [llmResponse]);

  if (!visible) return null;

  return (
    <div
      className="audit-panel absolute top-0 right-0 h-full w-full max-w-md flex flex-col border-l border-white/8"
      style={{ background: "var(--panel-bg)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div
            className={`w-2 h-2 rounded-full ${isLoading ? "bg-[#00c9ff] animate-pulse" : "bg-green-400"}`}
          />
          <h2 className="text-sm font-semibold tracking-wide text-white/90">
            Ancestry Audit
          </h2>
        </div>
        <button
          onClick={onStay}
          className="text-white/30 hover:text-white/70 transition-colors p-1"
          aria-label="Collapse panel"
          title="Collapse — keep the map"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3l5 5-5 5M1 8h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Data center info */}
        {dataCenter && (
          <Section title="Inferred Data Center">
            <div className="space-y-2">
              <div className="text-sm text-white/90 font-medium">
                {dataCenter.name}
              </div>
              <InfoRow label="Hardware" value={dataCenter.hardwareGeneration} />
              <InfoRow label="Territory" value={dataCenter.territory} />
              <InfoRow label="Provider" value={dataCenter.provider} />
              <InfoRow
                label="Coordinates"
                value={`${dataCenter.lat.toFixed(4)}°N, ${Math.abs(dataCenter.lon).toFixed(4)}°${dataCenter.lon < 0 ? "W" : "E"}`}
              />
              {report?.inferredDataCenter.waterSystem && (
                <InfoRow
                  label="Water system"
                  value={report.inferredDataCenter.waterSystem}
                  accent
                />
              )}
            </div>
          </Section>
        )}

        {/* LLM Response */}
        {(llmResponse || isStreaming) && (
          <Section title="Model Response">
            <div
              ref={responseRef}
              className="text-sm text-white/60 leading-relaxed max-h-48 overflow-y-auto"
            >
              {llmResponse}
              {isStreaming && (
                <span className="inline-block w-1 h-3.5 bg-[#00c9ff] ml-0.5 align-middle animate-pulse" />
              )}
            </div>
          </Section>
        )}

        {/* Water systems */}
        {report && report.waterSystems.length > 0 && (
          <Section title="Water Infrastructure">
            <div className="text-xs text-white/40 mb-2">
              Groundwater monitoring sites within 110 km of the data center
            </div>
            <div className="space-y-1.5">
              {report.waterSystems.slice(0, 5).map((ws) => (
                <div
                  key={ws.siteId}
                  className="rounded-lg bg-[rgba(74,159,255,0.06)] border border-[rgba(74,159,255,0.15)] px-3 py-2"
                >
                  <div className="text-xs text-[#4a9fff] font-medium truncate">
                    {ws.siteName}
                  </div>
                  {ws.aquiferName && (
                    <div className="text-[11px] text-white/40 mt-0.5">
                      {ws.aquiferName}
                    </div>
                  )}
                  <div className="text-[10px] text-white/25 mt-0.5">
                    USGS #{ws.siteId}
                  </div>
                </div>
              ))}
              {report.waterSystems.length > 5 && (
                <div className="text-[11px] text-white/30 pl-1">
                  +{report.waterSystems.length - 5} more sites
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Minerals */}
        {report && report.minerals.length > 0 && (
          <Section title="Material Supply Chain">
            <div className="text-xs text-white/40 mb-2">
              Minerals required by {dataCenter?.hardwareGeneration}
            </div>
            <div className="space-y-2">
              {report.minerals.map((m) => (
                <div
                  key={m.mineral}
                  className={`rounded-lg border px-3 py-2.5 ${MINERAL_CLASS[m.mineral] ?? "mineral-industrial"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold">
                      {m.displayName}
                    </span>
                    <span className="text-[10px] opacity-60 flex-shrink-0 mt-px">
                      {MINERAL_CATEGORY[m.mineral]}
                    </span>
                  </div>
                  <div className="text-[11px] opacity-70 mt-1 leading-snug">
                    {m.role}
                  </div>
                  <div className="text-[11px] opacity-50 mt-1">
                    Source: {m.primarySourceRegion}
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    {m.depositsFound > 0 ? (
                      <span className="text-[10px] opacity-40">
                        {m.depositsFound} deposits mapped
                      </span>
                    ) : (
                      <span className="text-[10px] opacity-30">
                        No deposits in MRDS for region
                      </span>
                    )}
                    <a
                      href={`https://mrdata.usgs.gov/mrds/search-by-name.php?q=${encodeURIComponent(m.mineral)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] opacity-40 hover:opacity-70 transition-opacity underline underline-offset-2 flex-shrink-0"
                    >
                      MRDS ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Loading skeleton */}
        {isLoading && !report && !dataCenter && (
          <Section title="Resolving infrastructure…">
            <div className="space-y-2">
              {[80, 60, 90, 50].map((w, i) => (
                <div
                  key={i}
                  className={`h-3 rounded shimmer`}
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          </Section>
        )}

        {/* Prompt stats */}
        {report && (
          <Section title="Audit Metadata">
            <div className="space-y-1.5">
              <InfoRow
                label="Estimated tokens"
                value={String(report.promptTokenEstimate)}
              />
              <InfoRow
                label="Provider"
                value={
                  report.provider === "openai" ? "OpenAI" : "Anthropic"
                }
              />
              <InfoRow label="Model" value={report.model} />
              <InfoRow
                label="Audit time"
                value={new Date(report.timestamp).toLocaleTimeString()}
              />
            </div>
          </Section>
        )}

        {/* Methodology */}
        {report && (
          <Section title="Methodology & Transparency">
            <p className="text-[11px] text-white/35 leading-relaxed">
              {report.methodology}
            </p>
            <div className="mt-3 flex flex-col gap-1.5">
              <SourceLink
                href="https://api.waterdata.usgs.gov"
                label="USGS Water Data API"
              />
              <SourceLink
                href="https://mrdata.usgs.gov/mrds/"
                label="USGS Mineral Resources Data System"
              />
              <SourceLink
                href="https://www.usgs.gov/centers/national-minerals-information-center/commodity-statistics-and-information"
                label="USGS Mineral Commodity Summaries"
              />
            </div>
          </Section>
        )}
      </div>

      {/* Footer: always visible once results arrive */}
      {(report || dataCenter) && (
        <div className="flex-shrink-0 px-5 py-4 border-t border-white/8 flex gap-3">
          <button
            onClick={onStay}
            className="flex-1 py-2.5 rounded-xl border border-white/12 text-white/50 text-xs hover:border-white/25 hover:text-white/70 transition-all"
          >
            Stay on map
          </button>
          <button
            onClick={onNewTrace}
            className="flex-1 py-2.5 rounded-xl bg-[rgba(0,201,255,0.1)] border border-[rgba(0,201,255,0.25)] text-[#00c9ff] text-xs font-medium hover:bg-[rgba(0,201,255,0.18)] transition-all"
          >
            New trace
          </button>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4 border-b border-white/5">
      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/30 mb-3">
        {title}
      </h3>
      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-white/35 w-24 flex-shrink-0">{label}</span>
      <span className={accent ? "text-[#4a9fff]" : "text-white/70"}>
        {value}
      </span>
    </div>
  );
}

function SourceLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[11px] text-white/30 hover:text-white/60 transition-colors flex items-center gap-1.5"
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        className="flex-shrink-0 opacity-60"
      >
        <path
          d="M1 9L9 1M9 1H4M9 1V6"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </a>
  );
}
