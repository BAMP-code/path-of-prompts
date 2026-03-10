"use client";

import { useState, useRef, useCallback } from "react";
import type { Provider } from "@/types/trace";

interface PromptInputProps {
  onSubmit: (prompt: string, provider: Provider, apiKey: string) => void;
  isLoading: boolean;
  onAbort?: () => void;
}

export default function PromptInput({ onSubmit, isLoading, onAbort }: PromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const [apiKey, setApiKey] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!prompt.trim() || isLoading) return;
      onSubmit(prompt.trim(), "openai", apiKey.trim());
      setPrompt("");
    },
    [prompt, apiKey, isLoading, onSubmit]
  );

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div
        className="rounded-2xl border border-white/10 bg-black/50 focus-within:border-white/25 transition-colors overflow-hidden"
        style={{ backdropFilter: "blur(24px)" }}
      >
        {/* API key row */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/8">
          <svg className="shrink-0 text-white/20" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7.5" cy="15.5" r="4.5"/>
            <path d="M21 8.5l-5 5-2-2"/>
            <path d="M14.5 9.5L12 12"/>
          </svg>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="API key"
            disabled={isLoading}
            autoComplete="off"
            spellCheck={false}
            className="flex-1 bg-transparent text-sm text-white/70 placeholder-white/20 outline-none tracking-widest font-mono"
          />
        </div>

        {/* Prompt row */}
        <div className="flex items-center gap-3 px-5 py-4">
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask anything"
            disabled={isLoading}
            autoComplete="off"
            className="flex-1 bg-transparent text-sm text-white placeholder-white/20 outline-none"
          />
          {isLoading ? (
            <button
              type="button"
              onClick={onAbort}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-white/8 hover:bg-white/15 transition-colors"
            >
              <span className="w-2.5 h-2.5 rounded-sm bg-white/60" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!prompt.trim()}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-white/8 hover:bg-white/15 disabled:opacity-20 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7h10M8 3l4 4-4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
