import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	PINNED_LLAMA_RUNTIME,
	assertCompleteRuntimeBundle,
	parseManagedLocalRuntimeSmokeArgs,
	verifyRuntimeArchive,
} from "../scripts/managed-local-runtime-smoke";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true }))
	);
});

describe("managed-local runtime smoke", () => {
	it("pins the approved llama.cpp source and archive identity", () => {
		expect(PINNED_LLAMA_RUNTIME).toMatchObject({
			release: "b10369",
			commit: "6e62ba538478202094edc6c100c782719e310aa3",
			archiveName: "llama-b10369-bin-macos-arm64.tar.gz",
			archiveBytes: 11_069_404,
			archiveSha256: "de2ac2c0a7cc245bce2411393658ff19c9c00d9d1fe37c5dfe94668c0d7bc01f",
		});
	});

	it("rejects an archive digest mismatch before extraction can be attempted", async () => {
		const directory = await mkdtemp(join(tmpdir(), "byok-runtime-smoke-test-"));
		temporaryDirectories.push(directory);
		const archivePath = join(directory, PINNED_LLAMA_RUNTIME.archiveName);
		await writeFile(archivePath, "not the pinned runtime archive");

		await expect(verifyRuntimeArchive(archivePath)).rejects.toThrow("archive size mismatch");
	});

	it("requires the executable, license, and sibling dynamic libraries", () => {
		expect(() => assertCompleteRuntimeBundle(["llama-b10369/llama-server"])).toThrow(
			"runtime archive is incomplete"
		);

		expect(() =>
			assertCompleteRuntimeBundle([
				"llama-b10369/llama-server",
				"llama-b10369/LICENSE",
				"llama-b10369/libllama-server-impl.dylib",
				"llama-b10369/libllama-common.0.0.10369.dylib",
				"llama-b10369/libllama.0.0.10369.dylib",
				"llama-b10369/libggml.0.19.0.dylib",
				"llama-b10369/libggml-base.0.19.0.dylib",
				"llama-b10369/libggml-cpu.0.19.0.dylib",
				"llama-b10369/libggml-metal.0.19.0.dylib",
			])
		).not.toThrow();
	});

	it("never opts into a model download", () => {
		expect(parseManagedLocalRuntimeSmokeArgs([])).toEqual({
			archivePath: undefined,
			keepWorkDirectory: false,
			modelPath: undefined,
		});
		expect(parseManagedLocalRuntimeSmokeArgs(["--model", "/models/small.gguf"]).modelPath).toBe(
			"/models/small.gguf"
		);
	});
});
