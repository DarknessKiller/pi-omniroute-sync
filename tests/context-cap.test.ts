import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { applyContextCap, contextCapPath, reloadContextCap } from "../src/context-cap.ts";

function capHome(config: Record<string, unknown>): string {
	const home = mkdtempSync(join(tmpdir(), "pi-omni-cap-"));
	mkdirSync(join(home, "extensions"), { recursive: true });
	writeFileSync(contextCapPath(home), JSON.stringify(config));
	reloadContextCap();
	return home;
}

it("applies the cap to matching models above appliesOver", () => {
	const home = capHome({ cap: 304768, appliesOver: 240000, maxTokens: 32768, matchPatterns: ["*"] });

	expect(applyContextCap(home, "openai/gpt-5", 400000, 64000)).toEqual({ contextWindow: 304768, maxTokens: 32768 });
	expect(applyContextCap(home, "openai/gpt-5", 200000, 64000)).toEqual({ contextWindow: 200000, maxTokens: 32768 });
});

it("ignores models that do not match matchPatterns", () => {
	const home = capHome({ cap: 100000, appliesOver: 50000, maxTokens: 4096, matchPatterns: ["claude"] });

	expect(applyContextCap(home, "openai/gpt-5", 400000, 64000)).toEqual({ contextWindow: 400000, maxTokens: 64000 });
	expect(applyContextCap(home, "anthropic/claude-sonnet", 400000, 64000)).toEqual({ contextWindow: 100000, maxTokens: 4096 });
});

it("lets per-model entries override globals", () => {
	const home = capHome({ cap: 100000, matchPatterns: ["*"], models: { "openai/gpt-5": { contextWindow: 80000, maxTokens: 8192 } } });

	expect(applyContextCap(home, "openai/gpt-5", 400000, 64000)).toEqual({ contextWindow: 80000, maxTokens: 8192 });
});

it("falls back to no cap when the file is missing", () => {
	const home = mkdtempSync(join(tmpdir(), "pi-omni-cap-"));
	reloadContextCap();

	expect(applyContextCap(home, "openai/gpt-5", 400000, 64000)).toEqual({ contextWindow: 400000, maxTokens: 64000 });
});
