import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const NODE_BUILTIN_IMPORTS = ["node:child_process", "node:os", "node:stream"] as const;
const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));

function fromPackage(path: string): string {
	return join(PACKAGE_ROOT, path);
}

function toPackagePath(path: string): string {
	return normalize(relative(PACKAGE_ROOT, path));
}

function readJson(path: string): Record<string, unknown> {
	return JSON.parse(readFileSync(fromPackage(path), "utf8")) as Record<string, unknown>;
}

function localImports(path: string): string[] {
	const source = readFileSync(path, "utf8");
	const imports: string[] = [];
	const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
	for (const match of source.matchAll(importPattern)) {
		const specifier = match[1];
		if (specifier?.startsWith(".")) imports.push(specifier);
	}
	return imports;
}

function resolveSourcePath(fromPath: string, specifier: string): string | null {
	const base = normalize(join(dirname(fromPath), specifier));
	for (const candidate of [`${base}.ts`, join(base, "index.ts")]) {
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

function transitiveLocalSources(entrypoint: string): string[] {
	const seen = new Set<string>();
	const queue = [fromPackage(entrypoint)];
	while (queue.length) {
		const current = queue.shift();
		if (!current || seen.has(current)) continue;
		seen.add(current);
		for (const specifier of localImports(current)) {
			const resolved = resolveSourcePath(current, specifier);
			if (resolved) queue.push(resolved);
		}
	}
	return [...seen].map(toPackagePath).sort();
}

describe("BYOK package readiness", () => {
	it("drafts package exports, declarations, and publish metadata", () => {
		const manifest = readJson("package.json");
		expect(manifest).toMatchObject({
			name: "@swartzrock/byok-runtime",
			type: "module",
			sideEffects: false,
			main: "./dist/index.js",
			types: "./dist/index.d.ts",
			repository: {
				type: "git",
				url: "git+https://github.com/swartzrock/byok-runtime.git",
			},
			publishConfig: {
				access: "public",
				provenance: true,
			},
		});
		expect(manifest.exports).toEqual({
			".": {
				types: "./dist/index.d.ts",
				import: "./dist/index.js",
			},
			"./node": {
				types: "./dist/node.d.ts",
				import: "./dist/node.js",
			},
		});
		expect(manifest.files).toEqual([
			"dist",
			"README.md",
			"API.md",
			"CHANGELOG.md",
			"LICENSE",
			"package.json",
		]);
		expect(manifest.engines).toEqual({
			node: ">=20",
		});
		expect(existsSync(fromPackage("README.md"))).toBe(true);
		expect(existsSync(fromPackage("API.md"))).toBe(true);
		expect(existsSync(fromPackage("LICENSE"))).toBe(true);
		expect(existsSync(fromPackage("CHANGELOG.md"))).toBe(true);
		expect(existsSync(fromPackage("SECURITY.md"))).toBe(true);
	});

	it("declares formatting, linting, and package validation gates", () => {
		const manifest = readJson("package.json");
		expect(manifest.scripts).toMatchObject({
			format: "prettier --write .",
			"format:check": "prettier --check .",
			lint: "eslint . --max-warnings=0",
			"pack:check": "npm pack --dry-run",
			publint: "publint",
			attw: "attw --pack --profile esm-only --ignore-rules cjs-resolves-to-esm no-resolution",
		});
		expect(existsSync(fromPackage(".prettierrc.json"))).toBe(true);
		expect(existsSync(fromPackage(".prettierignore"))).toBe(true);
		expect(existsSync(fromPackage("eslint.config.js"))).toBe(true);
		expect(existsSync(fromPackage(".npmrc"))).toBe(true);
		expect(existsSync(fromPackage("tsconfig.eslint.json"))).toBe(true);
	});

	it("declares standalone build and typecheck output", () => {
		const config = readJson("tsconfig.json");
		expect(config.include).toEqual(["src/**/*.ts"]);
		expect(config.compilerOptions).toMatchObject({
			declaration: true,
			declarationMap: true,
			noEmit: true,
			outDir: "dist",
			rootDir: "src",
			target: "ES2022",
		});
		expect(existsSync(fromPackage("tsup.config.ts"))).toBe(true);
	});

	it("keeps the main entrypoint away from Node-only local CLI files", () => {
		const files = transitiveLocalSources("src/index.ts");
		expect(files).not.toContain("src/node.ts");
		expect(files).not.toContain("src/providers/local-command-runner.ts");
		expect(files).not.toContain("src/providers/codex-cli-provider.ts");
		expect(files).not.toContain("src/providers/claude-cli-provider.ts");
		for (const file of files) {
			const source = readFileSync(fromPackage(file), "utf8");
			for (const nodeImport of NODE_BUILTIN_IMPORTS) {
				expect(source, file).not.toContain(nodeImport);
			}
		}
	});

	it("keeps the Node subpath as the only local CLI entrypoint", () => {
		const nodeSource = readFileSync(fromPackage("src/node.ts"), "utf8");
		expect(nodeSource).toContain("./providers/local-command-runner");
		expect(nodeSource).toContain("./providers/codex-cli-provider");
		expect(nodeSource).toContain("./providers/claude-cli-provider");
	});
});
