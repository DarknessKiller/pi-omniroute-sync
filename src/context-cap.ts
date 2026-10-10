import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Shared with pi-context-cap at <agentHome>/extensions/context-cap.json. */
export interface ContextCapConfig {
	cap?: number;
	maxTokens?: number;
	reserveTokens?: number;
	appliesOver?: number;
	matchPatterns?: string[];
	models?: Record<string, number | { contextWindow?: number; maxTokens?: number }>;
}

export function contextCapPath(agentHome: string): string {
	return join(agentHome, "extensions", "context-cap.json");
}

let cache: ContextCapConfig | undefined;
let cachedHome: string | undefined;

export function loadContextCap(agentHome: string): ContextCapConfig {
	if (cache !== undefined && cachedHome === agentHome) return cache;
	cachedHome = agentHome;
	try {
		cache = JSON.parse(readFileSync(contextCapPath(agentHome), "utf8")) as ContextCapConfig;
	} catch {
		cache = {};
	}
	return cache;
}

/** Drop the cache so the next sync re-reads the file. */
export function reloadContextCap(): void {
	cache = undefined;
	cachedHome = undefined;
}

function matchesPatterns(modelId: string, patterns: string[]): boolean {
	if (patterns.length === 0) return false;
	const id = modelId.toLowerCase();
	return patterns.some((pattern) => pattern === "*" || id.includes(pattern.toLowerCase()));
}

/** Cap contextWindow and set an explicit output limit for a matching model. */
export function applyContextCap(
	agentHome: string,
	id: string,
	contextWindow: number,
	maxTokens: number,
): { contextWindow: number; maxTokens: number } {
	return applyContextCapConfig(loadContextCap(agentHome), id, contextWindow, maxTokens);
}

export function applyContextCapConfig(
	cfg: ContextCapConfig,
	id: string,
	contextWindow: number,
	maxTokens: number,
): { contextWindow: number; maxTokens: number } {
	let cw = contextWindow;
	let mt = maxTokens;

	// Per-model override wins; contextWindow is a cap, maxTokens is exact.
	const perModel = cfg.models?.[id];
	if (perModel != null) {
		if (typeof perModel === "number") {
			if (cw > perModel) cw = perModel;
		} else {
			if (perModel.contextWindow != null && cw > perModel.contextWindow) cw = perModel.contextWindow;
			if (perModel.maxTokens != null && perModel.maxTokens > 0) mt = perModel.maxTokens;
		}
		return { contextWindow: cw, maxTokens: mt };
	}

	if (!matchesPatterns(id, cfg.matchPatterns ?? [])) return { contextWindow: cw, maxTokens: mt };

	const appliesOver = cfg.appliesOver ?? 200_000;
	const cap = cfg.cap ?? 200_000;
	if (cw > appliesOver && cap > 0) cw = cap;
	if (cfg.maxTokens != null && cfg.maxTokens > 0) mt = cfg.maxTokens;
	return { contextWindow: cw, maxTokens: mt };
}
