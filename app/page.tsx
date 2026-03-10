"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import PromptInput from "./components/PromptInput";
import AuditPanel from "./components/AuditPanel";
import type {
  Provider,
  Phase,
  InfrastructureGeoJSON,
  DataCenterNode,
  AuditReport,
  SSEEvent,
} from "@/types/trace";

const AncestryMap = dynamic(() => import("./components/AncestryMap"), {
  ssr: false,
});

export type LocationConsent = "pending" | "granted" | "skipped";

const DEFAULT_COORDS: [number, number] = [-74.006, 40.7128]; // NYC fallback

export default function Home() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [panelVisible, setPanelVisible] = useState(true);
  const [locationConsent, setLocationConsent] = useState<LocationConsent>("pending");
  // Resolved coordinate pair — null means "still waiting on GPS".
  // Lives only in JS memory; the beforeunload handler below zeroes the ref.
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const userLocationRef = useRef<[number, number] | null>(null);

  // Mirror state into ref so the beforeunload scrubber can zero it synchronously.
  useEffect(() => { userLocationRef.current = userLocation; }, [userLocation]);

  // Scrub coordinates from memory the instant the tab starts to close.
  useEffect(() => {
    const scrub = () => { userLocationRef.current = null; };
    window.addEventListener("beforeunload", scrub);
    return () => window.removeEventListener("beforeunload", scrub);
  }, []);

  // Geolocation — runs only when the user makes an explicit choice.
  // Location is NEVER sent to any server (the API receives only the prompt text).
  // It is not written to localStorage, cookies, or any persistent store.
  useEffect(() => {
    if (locationConsent === "skipped") {
      setUserLocation(DEFAULT_COORDS);
      return;
    }
    if (locationConsent !== "granted") return;

    if (!("geolocation" in navigator)) {
      setUserLocation(DEFAULT_COORDS);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation([pos.coords.longitude, pos.coords.latitude]);
      },
      () => {
        // Denied or timed out — fall back to NYC default.
        setUserLocation(DEFAULT_COORDS);
      },
      { timeout: 5000, maximumAge: 0 }
    );
  }, [locationConsent]);

  // Buffered data — accumulate during animation, reveal on complete
  const [llmResponse, setLlmResponse] = useState("");
  const [geojson, setGeojson] = useState<InfrastructureGeoJSON | null>(null);
  const [dataCenter, setDataCenter] = useState<DataCenterNode | null>(null);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isApiDone, setIsApiDone] = useState(false);

  // Refs to hold buffered data without causing re-renders during animation
  const bufferedLlm = useRef("");
  const bufferedGeojson = useRef<InfrastructureGeoJSON | null>(null);
  const bufferedDataCenter = useRef<DataCenterNode | null>(null);
  const bufferedReport = useRef<AuditReport | null>(null);
  const animationDoneRef = useRef(false);
  const apiDoneRef = useRef(false);

  const abortRef = useRef<AbortController | null>(null);

  const handleSubmit = useCallback(async (prompt: string, provider: Provider, apiKey: string) => {
    // Reset everything
    bufferedLlm.current = "";
    bufferedGeojson.current = null;
    bufferedDataCenter.current = null;
    bufferedReport.current = null;
    animationDoneRef.current = false;
    apiDoneRef.current = false;

    setLlmResponse("");
    setGeojson(null);
    setDataCenter(null);
    setReport(null);
    setError(null);
    setIsApiDone(false);
    setPanelVisible(true);
    setPhase("animating");

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, provider, apiKey }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`Request failed: ${response.status}`);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: SSEEvent;
          try { event = JSON.parse(raw); } catch { continue; }

          switch (event.type) {
            case "llm_chunk":
              bufferedLlm.current += event.content;
              break;
            case "infrastructure":
              bufferedGeojson.current = event.geojson;
              bufferedDataCenter.current = event.dataCenter;
              // Pass to map so animation can start as soon as data is ready
              setGeojson(event.geojson);
              setDataCenter(event.dataCenter);
              break;
            case "audit":
              bufferedReport.current = event.report;
              break;
            case "error":
              setError(event.message);
              break;
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Unexpected error");
      }
    } finally {
      apiDoneRef.current = true;
      setIsApiDone(true);
      // If animation already finished, reveal now
      if (animationDoneRef.current) revealResults();
    }
  }, []);

  const revealResults = useCallback(() => {
    setLlmResponse(bufferedLlm.current);
    setReport(bufferedReport.current);
    setPhase("result");
  }, []);

  const handleAnimationComplete = useCallback(() => {
    animationDoneRef.current = true;
    setPanelVisible(true);
    if (apiDoneRef.current) {
      revealResults();
    }
  }, [revealResults]);

  const handleAbort = useCallback(() => {
    abortRef.current?.abort();
    setPhase("landing");
  }, []);

  // "Stay on map" — collapse panel, keep map + dots visible
  const handleStay = useCallback(() => {
    setPanelVisible(false);
  }, []);

  // "New trace" — go back to landing, clear everything
  const handleNewTrace = useCallback(() => {
    setPhase("landing");
    setPanelVisible(true);
    setGeojson(null);
    setDataCenter(null);
    setReport(null);
    setLlmResponse("");
  }, []);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const isLanding = phase === "landing";
  const isResult = phase === "result";

  return (
    <div className="relative w-full h-full bg-[#080b10] overflow-hidden">

      {/* Map — shrinks only when result panel is open and visible */}
      <div className={`absolute inset-0 transition-all duration-500 ${isResult && panelVisible ? "md:right-[400px]" : ""}`}>
        <AncestryMap
          geojson={geojson}
          dataCenter={dataCenter}
          phase={phase}
          userLocation={userLocation ?? (locationConsent === "pending" ? DEFAULT_COORDS : null)}
          onAnimationComplete={handleAnimationComplete}
        />
      </div>

      {/* Landing screen overlay */}
      <div
        className={`absolute inset-0 z-30 flex flex-col items-center justify-end pb-12 transition-all duration-700 ${
          isLanding
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        style={{ background: "#080b10" }}
      >
        <div className="w-full max-w-lg px-6 space-y-4">

          {/* Location consent notice — shown until resolved */}
          {locationConsent === "pending" && (
            <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <svg className="mt-0.5 shrink-0 text-white/30" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                  <circle cx="12" cy="9" r="2.5"/>
                </svg>
                <p className="text-[11px] leading-relaxed text-white/35">
                  Your location is used <span className="text-white/55">only in this tab</span> to draw the animation starting point.
                  It is <span className="text-white/55">never sent to any server</span>, never written to disk, and is cleared
                  the moment you close this tab.
                </p>
              </div>
              <div className="flex gap-2 pl-[21px]">
                <button
                  onClick={() => setLocationConsent("granted")}
                  className="text-[11px] px-3 py-1.5 rounded-lg bg-white/8 text-white/60 hover:bg-white/14 hover:text-white/80 transition-colors"
                >
                  Allow location
                </button>
                <button
                  onClick={() => setLocationConsent("skipped")}
                  className="text-[11px] px-3 py-1.5 rounded-lg text-white/25 hover:text-white/45 transition-colors"
                >
                  Use anonymous
                </button>
              </div>
            </div>
          )}

          <PromptInput
            onSubmit={handleSubmit}
            isLoading={false}
            onAbort={handleAbort}
          />
        </div>
      </div>


      {/* Error toast */}
      {error && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 bg-red-900/80 border border-red-500/30 text-red-300 text-xs px-4 py-2.5 rounded-xl backdrop-blur-md max-w-sm text-center">
          {error}
        </div>
      )}

      {/* Result panel — slides in after animation, collapses on Stay */}
      {isResult && panelVisible && (
        <div className="absolute top-0 right-0 h-full w-full md:max-w-[400px] z-20">
          <AuditPanel
            llmResponse={llmResponse}
            isStreaming={false}
            report={report}
            dataCenter={dataCenter}
            isLoading={false}
            onStay={handleStay}
            onNewTrace={handleNewTrace}
          />
        </div>
      )}

      {/* Disclaimer button — always visible top-right */}
      <div className="absolute top-4 right-4 z-40">
        <button
          onClick={() => setShowDisclaimer(true)}
          className="text-[11px] px-3 py-1.5 rounded-lg border border-white/10 bg-black/40 text-white/30 hover:text-white/60 hover:border-white/20 transition-all"
          style={{ backdropFilter: "blur(12px)" }}
        >
          About
        </button>
      </div>

      {/* Disclaimer panel */}
      <div
        className={`absolute inset-0 z-50 flex items-center justify-center transition-all duration-300 ${
          showDisclaimer ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
        onClick={() => setShowDisclaimer(false)}
      >
        <div
          className="relative w-full max-w-lg mx-6 rounded-2xl border border-white/10 bg-[#0c1017] p-8 space-y-6"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setShowDisclaimer(false)}
            className="absolute top-4 right-4 text-white/30 hover:text-white/60 transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>

          <div>
            <h2 className="text-white text-base font-medium mb-1">The Ancestry Map</h2>
            <p className="text-white/40 text-xs">A real-time ethical audit of LLM infrastructure</p>
          </div>

          <div className="space-y-4 text-[13px] leading-relaxed text-white/60">
            <p>
              This project visualizes the physical supply chain behind an AI query — the data centers,
              water sources, and mineral deposits that make a single prompt possible.
            </p>
            <div className="border-t border-white/8 pt-4 space-y-3">
              <p className="text-white/40 text-[11px] uppercase tracking-wider">AI usage disclosure</p>
              <p>
                AI tools were used selectively in this project for:
              </p>
              <ul className="space-y-1.5 text-white/50 pl-3">
                <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span><span>Researching cloud infrastructure geography and data center locations</span></li>
                <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span><span>Understanding mineral supply chains in GPU and server manufacturing</span></li>
                <li className="flex gap-2"><span className="text-white/20 mt-0.5">—</span><span>Architectural planning and technical research</span></li>
              </ul>
              <p>
                All product decisions, ethical framing, visual design, and project direction
                were conceived and authored by the developer.
              </p>
            </div>
          </div>

          <div className="border-t border-white/8 pt-4">
            <p className="text-[11px] text-white/25">
              Data sources: OpenAI API · USGS Water Data · USGS Mineral Resources · Mapbox
            </p>
          </div>
        </div>
      </div>

      {/* Re-open tab — shown when panel is collapsed in result phase */}
      {isResult && !panelVisible && (
        <div className="absolute top-1/2 right-0 -translate-y-1/2 z-20">
          <button
            onClick={() => setPanelVisible(true)}
            className="flex items-center gap-2 pl-3 pr-2 py-3 rounded-l-xl bg-[rgba(8,11,16,0.88)] border border-r-0 border-white/10 text-white/40 hover:text-white/70 text-xs transition-colors"
            style={{ backdropFilter: "blur(16px)" }}
          >
            <span className="writing-mode-vertical">Results</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
