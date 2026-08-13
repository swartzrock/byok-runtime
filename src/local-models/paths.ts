import type { Stats } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	normalize,
	parse,
	relative,
	resolve,
	sep,
} from "node:path";

export const LOCAL_MODEL_STORAGE_VERSION = "v1";

const DIRECTORY_NAMES = ["runtimes", "models", "receipts", "staging", "locks", "leases"] as const;

export type LocalModelDirectoryName = (typeof DIRECTORY_NAMES)[number];

export interface LocalModelPaths {
	root: string;
	versionRoot: string;
	runtimes: string;
	models: string;
	receipts: string;
	staging: string;
	locks: string;
	leases: string;
}

export interface LocalModelPathOptions {
	root?: string;
	platform?: NodeJS.Platform;
	homeDirectory?: string;
}

export type ValidatedArtifactPath =
	| { exists: false; path: string }
	| { exists: true; path: string; stats: Stats };

export type LocalModelPathErrorCode =
	| "invalid-root"
	| "invalid-segment"
	| "path-escape"
	| "symbolic-link"
	| "hard-link"
	| "unexpected-type";

export class LocalModelPathError extends Error {
	readonly code: LocalModelPathErrorCode;

	constructor(code: LocalModelPathErrorCode, message: string) {
		super(message);
		this.name = "LocalModelPathError";
		this.code = code;
	}
}

function hasTraversalSegment(path: string): boolean {
	return path.replaceAll("\\", "/").split("/").includes("..");
}

function validateRoot(root: string): string {
	if (root.trim().length === 0 || root.includes("\0")) {
		throw new LocalModelPathError("invalid-root", "Local model storage root must not be empty");
	}
	if (hasTraversalSegment(root)) {
		throw new LocalModelPathError(
			"invalid-root",
			"Local model storage root must not contain path traversal segments"
		);
	}
	if (!isAbsolute(root)) {
		throw new LocalModelPathError("invalid-root", "Local model storage root must be absolute");
	}

	const normalizedRoot = normalize(root);
	if (normalizedRoot === parse(normalizedRoot).root) {
		throw new LocalModelPathError(
			"invalid-root",
			"Local model storage root must not be a filesystem root"
		);
	}
	return normalizedRoot;
}

function isMissingPathError(error: unknown): boolean {
	return (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function canonicalizeRoot(root: string): Promise<string> {
	let existingAncestor = root;
	const missingSegments: string[] = [];

	while (true) {
		try {
			const canonicalAncestor = await realpath(existingAncestor);
			return validateRoot(resolve(canonicalAncestor, ...missingSegments));
		} catch (error) {
			if (!isMissingPathError(error)) throw error;
			const parent = dirname(existingAncestor);
			if (parent === existingAncestor) throw error;
			missingSegments.unshift(basename(existingAncestor));
			existingAncestor = parent;
		}
	}
}

export function getDefaultLocalModelRoot(
	options: Pick<LocalModelPathOptions, "platform" | "homeDirectory"> = {}
): string {
	const platform = options.platform ?? process.platform;
	if (platform !== "darwin") {
		throw new LocalModelPathError(
			"invalid-root",
			"Built-in local model storage has no default root on this platform"
		);
	}

	const homeDirectory = validateRoot(options.homeDirectory ?? homedir());
	return join(homeDirectory, "Library", "Application Support", "byok-runtime");
}

export function assertCatalogOwnedPath(root: string, candidate: string): string {
	if (hasTraversalSegment(candidate)) {
		throw new LocalModelPathError(
			"path-escape",
			"Catalog-owned paths must not contain path traversal segments"
		);
	}

	const normalizedRoot = validateRoot(root);
	const normalizedCandidate = normalize(candidate);
	const pathFromRoot = relative(normalizedRoot, normalizedCandidate);
	if (
		pathFromRoot.length === 0 ||
		pathFromRoot === ".." ||
		pathFromRoot.startsWith(`..${sep}`) ||
		isAbsolute(pathFromRoot)
	) {
		throw new LocalModelPathError(
			"path-escape",
			"Catalog-owned path must remain beneath the local model storage root"
		);
	}
	return normalizedCandidate;
}

export async function resolveLocalModelPaths(
	options: LocalModelPathOptions = {}
): Promise<Readonly<LocalModelPaths>> {
	const selectedRoot = options.root ?? getDefaultLocalModelRoot(options);
	const root = await canonicalizeRoot(validateRoot(selectedRoot));
	const versionRoot = assertCatalogOwnedPath(root, join(root, LOCAL_MODEL_STORAGE_VERSION));
	const directories = Object.fromEntries(
		DIRECTORY_NAMES.map((name) => [name, assertCatalogOwnedPath(root, join(versionRoot, name))])
	) as Record<LocalModelDirectoryName, string>;

	return Object.freeze({ root, versionRoot, ...directories });
}

function validateSegment(segment: string): void {
	if (
		segment.length === 0 ||
		segment === "." ||
		segment === ".." ||
		segment.includes("/") ||
		segment.includes("\\") ||
		segment.includes("\0")
	) {
		throw new LocalModelPathError(
			"invalid-segment",
			"Catalog path segments must be non-empty names without separators or traversal"
		);
	}
}

export function resolveCatalogPath(
	paths: Readonly<LocalModelPaths>,
	directory: LocalModelDirectoryName,
	...segments: readonly string[]
): string {
	for (const segment of segments) validateSegment(segment);
	return assertCatalogOwnedPath(paths.root, join(paths[directory], ...segments));
}

export async function validateArtifactPath(
	paths: Readonly<LocalModelPaths>,
	candidate: string,
	expectedType?: "file" | "directory"
): Promise<ValidatedArtifactPath> {
	const artifactPath = assertCatalogOwnedPath(paths.root, candidate);
	const pathFromRoot = relative(paths.root, artifactPath);
	const segments = pathFromRoot.split(sep);
	let currentPath = paths.root;

	for (const [index, segment] of segments.entries()) {
		currentPath = join(currentPath, segment);
		let stats: Stats;
		try {
			stats = await lstat(currentPath);
		} catch (error) {
			if (isMissingPathError(error)) return { exists: false, path: artifactPath };
			throw error;
		}

		if (stats.isSymbolicLink()) {
			throw new LocalModelPathError(
				"symbolic-link",
				"Catalog-owned artifact paths must not contain symbolic links"
			);
		}

		const isTarget = index === segments.length - 1;
		if (!isTarget && !stats.isDirectory()) {
			throw new LocalModelPathError(
				"unexpected-type",
				"Catalog-owned artifact ancestors must be directories"
			);
		}
		if (!isTarget) continue;

		if (stats.isFile() && stats.nlink !== 1) {
			throw new LocalModelPathError(
				"hard-link",
				"Catalog-owned artifact files must not have hard links"
			);
		}
		if (
			(expectedType === "file" && !stats.isFile()) ||
			(expectedType === "directory" && !stats.isDirectory())
		) {
			throw new LocalModelPathError(
				"unexpected-type",
				`Catalog-owned artifact is not the expected ${expectedType}`
			);
		}
		return { exists: true, path: artifactPath, stats };
	}

	throw new LocalModelPathError("path-escape", "Catalog-owned path must identify an artifact");
}
