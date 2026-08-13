import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

export type ManagedArtifactDownloadErrorCode =
	| "cancelled"
	| "destination-exists"
	| "integrity-failure"
	| "network-failure"
	| "redirect-rejected"
	| "response-rejected";

export class ManagedArtifactDownloadError extends Error {
	readonly code: ManagedArtifactDownloadErrorCode;

	constructor(code: ManagedArtifactDownloadErrorCode, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "ManagedArtifactDownloadError";
		this.code = code;
	}
}

export interface ManagedArtifactDownloadSource {
	readonly url: string;
	readonly allowedHosts: readonly string[];
	readonly expectedBytes: number;
	readonly sha256: string;
}

export interface ManagedArtifactDownloadProgress {
	readonly downloadedBytes: number;
	readonly totalBytes: number;
}

export interface DownloadManagedArtifactOptions {
	readonly destinationPath: string;
	readonly fetchImpl?: typeof fetch;
	readonly maxAttempts?: number;
	readonly maxRedirects?: number;
	readonly onProgress?: (progress: ManagedArtifactDownloadProgress) => void;
	readonly requestTimeoutMs?: number;
	readonly signal?: AbortSignal;
	readonly source: ManagedArtifactDownloadSource;
}

export interface ManagedArtifactDownloadResult {
	readonly bytes: number;
	readonly sha256: string;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_REDIRECTS = 5;

export async function downloadManagedArtifact(
	options: DownloadManagedArtifactOptions
): Promise<ManagedArtifactDownloadResult> {
	validateSource(options.source);

	let ownsDestination = false;
	try {
		throwIfAborted(options.signal);
		const response = await fetchDownloadResponse(options);
		const contentLength = parseContentLength(response.headers.get("content-length"));
		if (contentLength !== options.source.expectedBytes) {
			throw new ManagedArtifactDownloadError(
				"response-rejected",
				`download length mismatch: expected ${options.source.expectedBytes}, received ${contentLength ?? "no content-length"}`
			);
		}
		if (!response.body) {
			throw new ManagedArtifactDownloadError("response-rejected", "download response has no body");
		}

		const output = createWriteStream(options.destinationPath, {
			flags: "wx",
			mode: 0o600,
		});
		ownsDestination = true;
		const digest = createHash("sha256");
		let downloadedBytes = 0;
		const verifier = new Transform({
			transform(chunk: Buffer, _encoding, callback) {
				downloadedBytes += chunk.byteLength;
				if (downloadedBytes > options.source.expectedBytes) {
					callback(
						new ManagedArtifactDownloadError(
							"integrity-failure",
							`download exceeded approved byte ceiling ${options.source.expectedBytes}`
						)
					);
					return;
				}
				digest.update(chunk);
				options.onProgress?.({
					downloadedBytes,
					totalBytes: options.source.expectedBytes,
				});
				callback(null, chunk);
			},
		});

		await pipeline(Readable.fromWeb(response.body as NodeReadableStream), verifier, output, {
			signal: options.signal,
		});

		if (downloadedBytes !== options.source.expectedBytes) {
			throw new ManagedArtifactDownloadError(
				"integrity-failure",
				`download ended early: expected ${options.source.expectedBytes}, received ${downloadedBytes}`
			);
		}
		const sha256 = digest.digest("hex");
		if (sha256 !== options.source.sha256) {
			throw new ManagedArtifactDownloadError(
				"integrity-failure",
				`download digest mismatch for ${safeUrl(options.source.url)}`
			);
		}

		return { bytes: downloadedBytes, sha256 };
	} catch (error) {
		if (ownsDestination) await unlink(options.destinationPath).catch(() => undefined);
		if (isAbortError(error) || options.signal?.aborted) {
			throw new ManagedArtifactDownloadError("cancelled", "download cancelled", { cause: error });
		}
		if (isDestinationExistsError(error)) {
			throw new ManagedArtifactDownloadError(
				"destination-exists",
				"download destination already exists",
				{ cause: error }
			);
		}
		throw error;
	}
}

async function fetchDownloadResponse(options: DownloadManagedArtifactOptions): Promise<Response> {
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	if (typeof fetchImpl !== "function") {
		throw new ManagedArtifactDownloadError("network-failure", "fetch is unavailable");
	}

	const maxAttempts = positiveInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS, "maxAttempts");
	let lastError: unknown;
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		throwIfAborted(options.signal);
		try {
			const response = await followRedirects(fetchImpl, options);
			if (response.status === 429 || response.status >= 500) {
				lastError = new ManagedArtifactDownloadError(
					"network-failure",
					`download source returned ${response.status}`
				);
				if (attempt < maxAttempts) continue;
				throw lastError;
			}
			if (!response.ok) {
				throw new ManagedArtifactDownloadError(
					"response-rejected",
					`download source returned ${response.status}`
				);
			}
			return response;
		} catch (error) {
			if (isAbortError(error) || options.signal?.aborted) throw error;
			if (error instanceof ManagedArtifactDownloadError && error.code !== "network-failure") {
				throw error;
			}
			lastError = error;
			if (attempt === maxAttempts) break;
		}
	}

	throw new ManagedArtifactDownloadError("network-failure", "download request failed", {
		cause: lastError,
	});
}

async function followRedirects(
	fetchImpl: typeof fetch,
	options: DownloadManagedArtifactOptions
): Promise<Response> {
	const maxRedirects = nonNegativeInteger(
		options.maxRedirects,
		DEFAULT_MAX_REDIRECTS,
		"maxRedirects"
	);
	let currentUrl = new URL(options.source.url);

	for (let redirectCount = 0; ; redirectCount += 1) {
		assertAllowedUrl(currentUrl, options.source.allowedHosts);
		const { signal, dispose } = deadlineSignal(
			options.signal,
			positiveInteger(options.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS, "requestTimeoutMs")
		);
		let response: Response;
		try {
			response = await fetchImpl(currentUrl, {
				headers: { accept: "application/octet-stream" },
				redirect: "manual",
				signal,
			});
		} finally {
			dispose();
		}

		if (response.status < 300 || response.status >= 400) return response;
		if (redirectCount >= maxRedirects) {
			throw new ManagedArtifactDownloadError(
				"redirect-rejected",
				"download exceeded redirect limit"
			);
		}
		const location = response.headers.get("location");
		if (!location) {
			throw new ManagedArtifactDownloadError(
				"redirect-rejected",
				"download redirect omitted its location"
			);
		}
		currentUrl = new URL(location, currentUrl);
	}
}

function validateSource(source: ManagedArtifactDownloadSource): void {
	if (!Number.isSafeInteger(source.expectedBytes) || source.expectedBytes <= 0) {
		throw new TypeError("expectedBytes must be a positive safe integer");
	}
	if (!/^[a-f0-9]{64}$/.test(source.sha256)) {
		throw new TypeError("sha256 must be a lowercase hexadecimal SHA-256 digest");
	}
	if (source.allowedHosts.length === 0) throw new TypeError("allowedHosts must not be empty");
	assertAllowedUrl(new URL(source.url), source.allowedHosts);
}

function assertAllowedUrl(url: URL, allowedHosts: readonly string[]): void {
	if (url.protocol !== "https:" || url.username || url.password || url.port) {
		throw new ManagedArtifactDownloadError(
			"redirect-rejected",
			`download URL is not an approved HTTPS endpoint: ${safeUrl(url)}`
		);
	}
	const hostname = url.hostname.toLowerCase();
	if (!allowedHosts.some((allowedHost) => allowedHost.toLowerCase() === hostname)) {
		throw new ManagedArtifactDownloadError(
			"redirect-rejected",
			`download host is not approved: ${hostname}`
		);
	}
}

function deadlineSignal(
	parent: AbortSignal | undefined,
	timeoutMs: number
): { signal: AbortSignal; dispose: () => void } {
	const controller = new AbortController();
	const abort = () => controller.abort(parent?.reason);
	parent?.addEventListener("abort", abort, { once: true });
	if (parent?.aborted) abort();
	const timer = setTimeout(
		() => controller.abort(new Error("download request timed out")),
		timeoutMs
	);
	return {
		signal: controller.signal,
		dispose: () => {
			clearTimeout(timer);
			parent?.removeEventListener("abort", abort);
		},
	};
}

function parseContentLength(value: string | null): number | undefined {
	if (!value || !/^\d+$/.test(value)) return undefined;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
	const resolved = value ?? fallback;
	if (!Number.isSafeInteger(resolved) || resolved <= 0) {
		throw new TypeError(`${name} must be a positive safe integer`);
	}
	return resolved;
}

function nonNegativeInteger(value: number | undefined, fallback: number, name: string): number {
	const resolved = value ?? fallback;
	if (!Number.isSafeInteger(resolved) || resolved < 0) {
		throw new TypeError(`${name} must be a non-negative safe integer`);
	}
	return resolved;
}

function safeUrl(value: string | URL): string {
	const url = typeof value === "string" ? new URL(value) : value;
	return `${url.origin}${url.pathname}`;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function isDestinationExistsError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "EEXIST"
	);
}
