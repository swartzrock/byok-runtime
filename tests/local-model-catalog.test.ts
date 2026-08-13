import { describe, expect, it } from "vitest";
import {
	getManagedLocalCatalog,
	getManagedLocalCompatibility,
} from "../src/local-models/catalog";

describe("managed-local catalog", () => {
	it("embeds the exact pinned model and runtime artifacts", () => {
		const catalog = getManagedLocalCatalog({ platform: "darwin", architecture: "arm64" });

		expect(catalog.version).toBe("1");
		expect(catalog.models).toEqual([
			expect.objectContaining({
				id: "qwen3-0.6b-q8_0",
				choice: "small",
				profile: "Lowest disk/RAM option",
				defaultContextTokens: 8_192,
				thinking: "disabled",
				artifact: expect.objectContaining({
					filename: "Qwen3-0.6B-Q8_0.gguf",
					bytes: 639_446_688,
					sha256: "9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031",
					license: "Apache-2.0",
					source: expect.objectContaining({
						repository: "Qwen/Qwen3-0.6B-GGUF",
						revision: "23749fefcc72300e3a2ad315e1317431b06b590a",
					}),
				}),
			}),
			expect.objectContaining({
				id: "qwen3-1.7b-q8_0",
				choice: "recommended",
				profile: "Default balance",
				defaultContextTokens: 8_192,
				thinking: "disabled",
				artifact: expect.objectContaining({
					filename: "Qwen3-1.7B-Q8_0.gguf",
					bytes: 1_834_426_016,
					sha256: "061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a",
					license: "Apache-2.0",
					source: expect.objectContaining({
						repository: "Qwen/Qwen3-1.7B-GGUF",
						revision: "90862c4b9d2787eaed51d12237eafdfe7c5f6077",
					}),
				}),
			}),
			expect.objectContaining({
				id: "qwen3-4b-q4_k_m",
				choice: "quality",
				profile: "Higher-quality option",
				defaultContextTokens: 8_192,
				thinking: "disabled",
				artifact: expect.objectContaining({
					filename: "Qwen3-4B-Q4_K_M.gguf",
					bytes: 2_497_280_256,
					sha256: "7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5",
					license: "Apache-2.0",
					source: expect.objectContaining({
						repository: "Qwen/Qwen3-4B-GGUF",
						revision: "bc640142c66e1fdd12af0bd68f40445458f3869b",
					}),
				}),
			}),
		]);
		expect(catalog.runtime).toEqual(
			expect.objectContaining({
				id: "llama-cpp-b10369-macos-arm64",
				filename: "llama-b10369-bin-macos-arm64.tar.gz",
				bytes: 11_069_404,
				sha256: "de2ac2c0a7cc245bce2411393658ff19c9c00d9d1fe37c5dfe94668c0d7bc01f",
				license: "MIT",
				source: {
					kind: "github-release",
					repository: "ggml-org/llama.cpp",
					revision: "6e62ba538478202094edc6c100c782719e310aa3",
					release: "b10369",
					url: "https://github.com/ggml-org/llama.cpp/releases/download/b10369/llama-b10369-bin-macos-arm64.tar.gz",
				},
			})
		);
	});

	it("keeps catalog and artifact identities unique", () => {
		const catalog = getManagedLocalCatalog({ platform: "darwin", architecture: "arm64" });
		const modelIds = catalog.models.map((model) => model.id);
		const artifactIds = [catalog.runtime.id, ...catalog.models.map((model) => model.artifact.id)];
		const sourceFiles = catalog.models.map(
			(model) => `${model.artifact.source.revision}/${model.artifact.filename}`
		);

		expect(new Set(modelIds).size).toBe(modelIds.length);
		expect(new Set(artifactIds).size).toBe(artifactIds.length);
		expect(new Set(sourceFiles).size).toBe(sourceFiles.length);
	});

	it.each([
		[{ platform: "darwin", architecture: "arm64" }, "compatible", undefined],
		[
			{ platform: "darwin", architecture: "x64" },
			"unsupported",
			"unsupported-architecture",
		],
		[{ platform: "win32", architecture: "x64" }, "unsupported", "unsupported-platform"],
		[{ platform: "linux", architecture: "arm64" }, "unsupported", "unsupported-platform"],
	] as const)("reports deterministic compatibility for %o", (target, status, reason) => {
		const compatibility = getManagedLocalCompatibility(target);

		expect(compatibility.status).toBe(status);
		if (compatibility.status === "unsupported") {
			expect(compatibility.reason).toBe(reason);
			expect(compatibility.message).toMatch(/^Managed-local v1 /);
		}
	});

	it("returns deep-frozen snapshots instead of catalog references", () => {
		const first = getManagedLocalCatalog({ platform: "darwin", architecture: "arm64" });
		const second = getManagedLocalCatalog({ platform: "darwin", architecture: "arm64" });

		expect(first).not.toBe(second);
		expect(first.models).not.toBe(second.models);
		expect(first.models[0]).not.toBe(second.models[0]);
		expect(Object.isFrozen(first)).toBe(true);
		expect(Object.isFrozen(first.models)).toBe(true);
		expect(Object.isFrozen(first.models[0])).toBe(true);
		expect(Object.isFrozen(first.models[0]?.artifact.source)).toBe(true);
		expect(() => {
			(first.models as unknown as Array<{ id: string }>)[0] = { id: "changed" };
		}).toThrow();
		expect(second.models[0]?.id).toBe("qwen3-0.6b-q8_0");
	});
});
