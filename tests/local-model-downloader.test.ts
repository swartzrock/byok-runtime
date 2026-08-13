import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	downloadManagedArtifact,
	type ManagedArtifactDownloadError,
	type ManagedArtifactDownloadSource,
} from "../src/local-models/downloader";

const directories: string[] = [];
const bytes = new TextEncoder().encode("verified model bytes");
const source: ManagedArtifactDownloadSource = {
	url: "https://huggingface.co/owner/model/resolve/commit/model.gguf",
	allowedHosts: ["huggingface.co", "cdn-lfs.hf.co"],
	expectedBytes: bytes.byteLength,
	sha256: createHash("sha256").update(bytes).digest("hex"),
};

afterEach(async () => {
	vi.useRealTimers();
	await Promise.all(
		directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

describe("managed artifact downloader", () => {
	it("streams and verifies exact approved bytes", async () => {
		const destinationPath = await destination("model.partial");
		const progress: number[] = [];

		await expect(
			downloadManagedArtifact({
				destinationPath,
				fetchImpl: responseFetch(bytes),
				onProgress: ({ downloadedBytes }) => progress.push(downloadedBytes),
				source,
			})
		).resolves.toEqual({ bytes: bytes.byteLength, sha256: source.sha256 });
		expect(new Uint8Array(await readFile(destinationPath))).toEqual(bytes);
		expect(progress.at(-1)).toBe(bytes.byteLength);
	});

	it("follows only catalog-approved HTTPS redirects", async () => {
		const destinationPath = await destination("model.partial");
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				new Response(null, {
					status: 302,
					headers: { location: "https://cdn-lfs.hf.co/signed/model.gguf?secret=value" },
				})
			)
			.mockResolvedValueOnce(downloadResponse(bytes));

		await downloadManagedArtifact({ destinationPath, fetchImpl, source });

		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(fetchImpl.mock.calls[1]?.[0].toString()).toContain("cdn-lfs.hf.co");
	});

	it.each([
		"http://cdn-lfs.hf.co/model.gguf",
		"https://127.0.0.1/model.gguf",
		"https://user:password@cdn-lfs.hf.co/model.gguf",
	])("rejects an unsafe redirect without creating a file: %s", async (location) => {
		const destinationPath = await destination("model.partial");
		const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(null, {
				status: 302,
				headers: { location },
			})
		);

		await expect(
			downloadManagedArtifact({ destinationPath, fetchImpl, source })
		).rejects.toMatchObject({ code: "redirect-rejected" });
		await expect(stat(destinationPath)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("rejects a missing or different content length before writing", async () => {
		const destinationPath = await destination("model.partial");

		await expect(
			downloadManagedArtifact({
				destinationPath,
				fetchImpl: (async () => new Response(bytes, { status: 200 })) as typeof fetch,
				source,
			})
		).rejects.toMatchObject({ code: "response-rejected" });
		await expect(stat(destinationPath)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("removes operation-owned bytes after a digest mismatch", async () => {
		const destinationPath = await destination("model.partial");

		await expect(
			downloadManagedArtifact({
				destinationPath,
				fetchImpl: responseFetch(bytes),
				source: { ...source, sha256: "0".repeat(64) },
			})
		).rejects.toMatchObject({ code: "integrity-failure" });
		await expect(stat(destinationPath)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("does not retry after accepting a response body", async () => {
		const destinationPath = await destination("model.partial");
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(bytes.slice(0, 4));
				controller.error(new Error("connection reset"));
			},
		});
		const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(body, {
				status: 200,
				headers: { "content-length": String(bytes.byteLength) },
			})
		);

		await expect(
			downloadManagedArtifact({ destinationPath, fetchImpl, maxAttempts: 3, source })
		).rejects.toThrow("connection reset");
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		await expect(stat(destinationPath)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("retries only pre-body transient failures within the attempt budget", async () => {
		const destinationPath = await destination("model.partial");
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockRejectedValueOnce(new TypeError("temporary DNS error"))
			.mockResolvedValueOnce(downloadResponse(bytes));

		await expect(
			downloadManagedArtifact({ destinationPath, fetchImpl, maxAttempts: 2, source })
		).resolves.toMatchObject({ bytes: bytes.byteLength });
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it("maps cancellation once and removes its partial file", async () => {
		const destinationPath = await destination("model.partial");
		const controller = new AbortController();
		const body = new ReadableStream<Uint8Array>({
			start(streamController) {
				streamController.enqueue(bytes.slice(0, 4));
				controller.abort();
			},
		});

		await expect(
			downloadManagedArtifact({
				destinationPath,
				fetchImpl: (async () =>
					new Response(body, {
						status: 200,
						headers: { "content-length": String(bytes.byteLength) },
					})) as typeof fetch,
				signal: controller.signal,
				source,
			})
		).rejects.toEqual(
			expect.objectContaining<Partial<ManagedArtifactDownloadError>>({ code: "cancelled" })
		);
		await expect(stat(destinationPath)).rejects.toMatchObject({ code: "ENOENT" });
	});
});

function responseFetch(body: Uint8Array): typeof fetch {
	return (async () => downloadResponse(body)) as typeof fetch;
}

function downloadResponse(body: Uint8Array): Response {
	return new Response(body, {
		status: 200,
		headers: { "content-length": String(body.byteLength) },
	});
}

async function destination(name: string): Promise<string> {
	const parent = await mkdtemp(join(tmpdir(), "byok-runtime-downloader-test-"));
	directories.push(parent);
	await mkdir(parent, { recursive: true });
	return join(parent, name);
}
