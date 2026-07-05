import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface SourceFile {
	path: string;
	source: string;
}

const FORBIDDEN_BARE_IMPORTS = new Set(["obsidian", "@codemirror/view"]);
const FORBIDDEN_LOCAL_MODULES = new Set([
	"appearance-thumbnail-controls",
	"cornell-view",
	"cue-extension",
	"editor-cue-display",
	"main",
	"model-combobox",
	"notice",
	"reading-cues",
	"settings",
	"study-area",
	"visibility",
]);
const FORBIDDEN_SOURCE_PATTERNS: Array<[RegExp, string]> = [
	[/\bHTML[A-Za-z]*Element\b/, "DOM element type"],
	[/\bcreateEl\b/, "Obsidian DOM helper"],
	[/\bactiveDocument\b/, "Obsidian active document global"],
	[/\bdocument\./, "DOM document access"],
	[/\bwindow\./, "DOM window access"],
];
const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCE_ROOT = join(PACKAGE_ROOT, "src");

function importedSpecifiers(source: string): string[] {
	const specifiers: string[] = [];
	const importPattern =
		/(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
	for (const match of source.matchAll(importPattern)) {
		const specifier = match[1] ?? match[2];
		if (specifier) specifiers.push(specifier);
	}
	return specifiers;
}

function localModuleName(specifier: string): string {
	const withoutExtension = specifier.replace(/\.(ts|tsx|js|jsx)$/, "");
	const parts = withoutExtension.split("/");
	return parts[parts.length - 1] ?? "";
}

function resolvedLocalImportPath(filePath: string, specifier: string): string {
	return normalize(join(dirname(filePath), specifier));
}

function findForbiddenByokImports(files: SourceFile[]): string[] {
	const violations: string[] = [];
	for (const file of files) {
		for (const specifier of importedSpecifiers(file.source)) {
			if (FORBIDDEN_BARE_IMPORTS.has(specifier)) {
				violations.push(`${file.path} imports ${specifier}`);
				continue;
			}
			if (specifier.startsWith("..") && specifier.includes("/providers/")) {
				violations.push(`${file.path} imports ${specifier}`);
				continue;
			}
			if (
				specifier.startsWith(".") &&
				!resolvedLocalImportPath(file.path, specifier).startsWith(normalize("src/"))
			) {
				violations.push(`${file.path} imports ${specifier} outside src`);
				continue;
			}
			if (specifier.startsWith(".") && FORBIDDEN_LOCAL_MODULES.has(localModuleName(specifier))) {
				violations.push(`${file.path} imports ${specifier}`);
			}
		}
		for (const [pattern, label] of FORBIDDEN_SOURCE_PATTERNS) {
			if (pattern.test(file.source)) {
				violations.push(`${file.path} uses ${label}`);
			}
		}
	}
	return violations;
}

function collectTypeScriptFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const entries = readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectTypeScriptFiles(path));
			continue;
		}
		if (entry.isFile() && path.endsWith(".ts")) files.push(path);
	}
	return files;
}

function readByokSources(): SourceFile[] {
	return collectTypeScriptFiles(SOURCE_ROOT).map((path) => ({
		path: relative(PACKAGE_ROOT, path),
		source: readFileSync(path, "utf8"),
	}));
}

describe("BYOK import boundary", () => {
	it("detects forbidden imports in fixture sources", () => {
		expect(
			findForbiddenByokImports([
				{
					path: "src/bad.ts",
					source:
						'import { App } from "obsidian";\n' +
						'import type { EditorView } from "@codemirror/view";\n' +
						'import type { HostAppSettings } from "../settings";\n' +
						'import { renderModelCombobox } from "../model-combobox";\n' +
						'import { OpenAIProvider } from "../../providers/openai-provider";\n' +
						'const root: HTMLElement | null = document.querySelector(".x");\n' +
						'activeDocument.body.createEl("div");\n',
				},
			])
		).toEqual([
			"src/bad.ts imports obsidian",
			"src/bad.ts imports @codemirror/view",
			"src/bad.ts imports ../settings outside src",
			"src/bad.ts imports ../model-combobox outside src",
			"src/bad.ts imports ../../providers/openai-provider",
			"src/bad.ts uses DOM element type",
			"src/bad.ts uses Obsidian DOM helper",
			"src/bad.ts uses Obsidian active document global",
			"src/bad.ts uses DOM document access",
		]);
	});

	it("keeps current BYOK files free of Obsidian, settings, and UI imports", () => {
		expect(findForbiddenByokImports(readByokSources())).toEqual([]);
	});
});
