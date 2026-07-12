import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = resolve("examples/first-available-llm.sh");
const SYSTEM_PATH = "/usr/bin:/bin";
let directory: string;
let log: string;

async function executable(directory: string, name: string, body: string): Promise<void> {
	const path = join(directory, name);
	await writeFile(path, `#!/bin/bash\n${body}\n`);
	await chmod(path, 0o755);
}

function runExample(question = "What is BYOK?", extraEnv: Readonly<Record<string, string>> = {}) {
	return spawnSync("/bin/bash", [SCRIPT, question], {
		encoding: "utf8",
		env: {
			PATH: `${directory}:${SYSTEM_PATH}`,
			HOME: directory,
			BUN_LOG: log,
			...extraEnv,
		},
	});
}

describe("first available LLM example", () => {
	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), "byok-first-available-"));
		log = join(directory, "bun.log");
	});

	afterEach(async () => {
		await rm(directory, { recursive: true, force: true });
	});

	it("prefers a running Ollama server over an installed CLI", async () => {
		await executable(
			directory,
			"bun",
			`printf '%s\\n' "$*" >> "$BUN_LOG"
case "$*" in
	*" detect"*) printf 'ollama\\nlm-studio\\ncodex-cli\\n' ;;
  *" models --provider ollama"*) printf 'llama3.2\\nqwen3\\n' ;;
  *" generate --provider ollama "*) printf 'Local answer.\\n' ;;
  *) exit 1 ;;
esac`
		);

		const result = runExample();

		expect(result.status).toBe(0);
		expect(result.stdout).toBe("Local answer.\n");
		const invocations = (await readFile(log, "utf8")).trim().split("\n");
		expect(invocations).toHaveLength(3);
		expect(invocations[0]).toContain("provider-smoke/src/cli.ts detect");
		expect(invocations[1]).toContain("models --provider ollama");
		expect(invocations[2]).toMatch(
			/generate --provider ollama --model (?:llama3\.2|qwen3) --input What is BYOK\?/
		);
	});

	it("uses an installed Codex CLI and prints only its generated response", async () => {
		await executable(
			directory,
			"bun",
			`printf '%s\\n' "$*" >> "$BUN_LOG"
case "$*" in
	*" detect"*) printf 'codex-cli\\nclaude-cli\\nanthropic\\n' ;;
  *" models --provider codex-cli"*) printf 'gpt-5\\ngpt-5-mini\\n' ;;
  *" generate --provider codex-cli "*) printf 'Generated answer.\\n' ;;
  *) exit 1 ;;
esac`
		);

		const result = runExample("What is BYOK?", {
			ANTHROPIC_API_KEY: "anthropic-test",
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toBe("Generated answer.\n");
		expect(result.stderr).toBe("");
		const invocations = (await readFile(log, "utf8")).trim().split("\n");
		expect(invocations).toHaveLength(3);
		expect(invocations[0]).toContain("provider-smoke/src/cli.ts detect");
		expect(invocations[1]).toContain("models --provider codex-cli");
		expect(invocations[2]).toMatch(
			/generate --provider codex-cli --model gpt-5(?:-mini)? --input What is BYOK\?/
		);
	});

	it("falls through when an earlier detected provider cannot list models", async () => {
		await executable(
			directory,
			"bun",
			`printf '%s\\n' "$*" >> "$BUN_LOG"
case "$*" in
	*" detect"*) printf 'ollama\\ncodex-cli\\n' ;;
  *" models --provider ollama"*) exit 1 ;;
  *" models --provider codex-cli"*) printf 'gpt-5\\n' ;;
  *" generate --provider codex-cli "*) printf 'Fallback answer.\\n' ;;
  *) exit 1 ;;
esac`
		);

		const result = runExample();

		expect(result.status).toBe(0);
		expect(result.stdout).toBe("Fallback answer.\n");
		expect(result.stderr).toBe("");
		const invocations = (await readFile(log, "utf8")).trim().split("\n");
		expect(invocations).toHaveLength(4);
		expect(invocations[0]).toContain("provider-smoke/src/cli.ts detect");
		expect(invocations[1]).toContain("models --provider ollama");
		expect(invocations[2]).toContain("models --provider codex-cli");
	});

	it("uses the first API-key provider after local and CLI checks", async () => {
		await executable(
			directory,
			"bun",
			`printf '%s\\n' "$*" >> "$BUN_LOG"
case "$*" in
	*" detect"*) printf 'anthropic\\nopenai\\n' ;;
  *" models --provider anthropic"*) printf 'claude-test\\n' ;;
  *" generate --provider anthropic "*) printf 'Cloud answer.\\n' ;;
  *) exit 1 ;;
esac`
		);

		const result = runExample("What is BYOK?", {
			ANTHROPIC_API_KEY: "anthropic-test",
			OPENAI_API_KEY: "openai-test",
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toBe("Cloud answer.\n");
		const invocations = (await readFile(log, "utf8")).trim().split("\n");
		expect(invocations).toHaveLength(3);
		expect(invocations[0]).toContain("provider-smoke/src/cli.ts detect");
		expect(invocations[1]).toContain("models --provider anthropic");
	});

	it("returns 127 before discovery when Bun is unavailable", async () => {
		const result = runExample();

		expect(result.status).toBe(127);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("Bun is required to run the BYOK Runtime example.");
		await expect(readFile(log, "utf8")).rejects.toThrow();
	});

	it("exits nonzero when discovery returns no providers", async () => {
		await executable(
			directory,
			"bun",
			`printf '%s\\n' "$*" >> "$BUN_LOG"
case "$*" in
	*" detect"*) exit 0 ;;
	*) exit 1 ;;
esac`
		);

		const result = runExample();

		expect(result.status).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("No available LLM provider found.");
		expect(await readFile(log, "utf8")).toContain("provider-smoke/src/cli.ts detect");
	});

	it("exits nonzero when provider discovery fails", async () => {
		await executable(
			directory,
			"bun",
			`printf '%s\n' "$*" >> "$BUN_LOG"
case "$*" in
	*" detect"*) exit 2 ;;
	*) exit 1 ;;
esac`
		);

		const result = runExample();

		expect(result.status).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("LLM provider discovery failed.");
		expect(await readFile(log, "utf8")).toContain("provider-smoke/src/cli.ts detect");
	});
});
