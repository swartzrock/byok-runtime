import { access, link, lstat, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	LOCAL_MODEL_STORAGE_VERSION,
	LocalModelPathError,
	assertCatalogOwnedPath,
	getDefaultLocalModelRoot,
	resolveCatalogPath,
	resolveLocalModelPaths,
	validateArtifactPath,
} from "../src/local-models/paths";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true }))
	);
});

async function makeTemporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "byok-local-model-paths-"));
	temporaryDirectories.push(directory);
	return directory;
}

describe("local model paths", () => {
	it("derives the default macOS support root from injected platform facts", () => {
		expect(
			getDefaultLocalModelRoot({ platform: "darwin", homeDirectory: "/Users/example" })
		).toBe("/Users/example/Library/Application Support/byok-runtime");
		expect(() =>
			getDefaultLocalModelRoot({ platform: "linux", homeDirectory: "/home/example" })
		).toThrow("no default root");
	});

	it("canonicalizes an override and derives every versioned owned directory", async () => {
		const parent = await makeTemporaryDirectory();
		const root = join(parent, "managed-storage");
		const paths = await resolveLocalModelPaths({ root });
		const versionRoot = join(root, LOCAL_MODEL_STORAGE_VERSION);

		expect(paths).toEqual({
			root,
			versionRoot,
			runtimes: join(versionRoot, "runtimes"),
			models: join(versionRoot, "models"),
			receipts: join(versionRoot, "receipts"),
			staging: join(versionRoot, "staging"),
			locks: join(versionRoot, "locks"),
			leases: join(versionRoot, "leases"),
		});
		await expect(access(root)).rejects.toThrow();
	});

	it("canonicalizes a symlinked root once without retaining the alias", async () => {
		const parent = await makeTemporaryDirectory();
		const target = join(parent, "target");
		const alias = join(parent, "alias");
		await mkdir(target);
		await symlink(target, alias);

		const paths = await resolveLocalModelPaths({ root: alias });

		expect(paths.root).toBe(target);
		expect(paths.models.startsWith(`${target}/`)).toBe(true);
	});

	it.each(["", "   ", "relative/store", ".", "/", "/tmp/store/../escape"])(
		"rejects the unsafe root override %j",
		async (root) => {
			await expect(resolveLocalModelPaths({ root })).rejects.toBeInstanceOf(LocalModelPathError);
		}
	);

	it("rejects traversal and non-atomic catalog path segments", async () => {
		const parent = await makeTemporaryDirectory();
		const paths = await resolveLocalModelPaths({ root: join(parent, "store") });

		expect(resolveCatalogPath(paths, "models", "model-a", "weights.gguf")).toBe(
			join(paths.models, "model-a", "weights.gguf")
		);
		for (const segment of ["", ".", "..", "../escape", "nested/file", "nested\\file"]) {
			expect(() => resolveCatalogPath(paths, "models", segment)).toThrow(
				"Catalog path segments"
			);
		}
		expect(() => assertCatalogOwnedPath(paths.root, resolve(paths.root, "../escape"))).toThrow(
			"must remain beneath"
		);
		expect(() => assertCatalogOwnedPath(paths.root, `${paths.models}/../receipts/file`)).toThrow(
			"path traversal"
		);
	});

	it("reports missing artifacts without creating storage", async () => {
		const parent = await makeTemporaryDirectory();
		const paths = await resolveLocalModelPaths({ root: join(parent, "store") });
		const artifactPath = resolveCatalogPath(paths, "models", "model-a", "weights.gguf");

		await expect(validateArtifactPath(paths, artifactPath, "file")).resolves.toEqual({
			exists: false,
			path: artifactPath,
		});
		await expect(access(paths.root)).rejects.toThrow();
	});

	it("validates regular artifact files and rejects hard-linked files", async () => {
		const parent = await makeTemporaryDirectory();
		const paths = await resolveLocalModelPaths({ root: join(parent, "store") });
		const artifactPath = resolveCatalogPath(paths, "models", "model-a", "weights.gguf");
		await mkdir(join(paths.models, "model-a"), { recursive: true });
		await writeFile(artifactPath, "model bytes");

		const validated = await validateArtifactPath(paths, artifactPath, "file");
		expect(validated.exists).toBe(true);
		if (validated.exists) expect(validated.stats.size).toBe(11);

		await link(artifactPath, join(parent, "external-hard-link"));
		await expect(validateArtifactPath(paths, artifactPath, "file")).rejects.toMatchObject({
			code: "hard-link",
		});
	});

	it("rejects symbolic links at the target or any artifact ancestor", async () => {
		const parent = await makeTemporaryDirectory();
		const paths = await resolveLocalModelPaths({ root: join(parent, "store") });
		await mkdir(paths.models, { recursive: true });
		const external = join(parent, "external");
		await mkdir(external);
		await writeFile(join(external, "weights.gguf"), "external bytes");

		const linkedAncestor = resolveCatalogPath(paths, "models", "linked-model");
		await symlink(external, linkedAncestor);
		await expect(
			validateArtifactPath(paths, join(linkedAncestor, "weights.gguf"), "file")
		).rejects.toMatchObject({ code: "symbolic-link" });

		const linkedArtifact = resolveCatalogPath(paths, "models", "weights.gguf");
		await symlink(join(external, "weights.gguf"), linkedArtifact);
		await expect(validateArtifactPath(paths, linkedArtifact, "file")).rejects.toMatchObject({
			code: "symbolic-link",
		});
	});

	it("requires existing artifact ancestors and targets to have the expected type", async () => {
		const parent = await makeTemporaryDirectory();
		const paths = await resolveLocalModelPaths({ root: join(parent, "store") });
		await mkdir(paths.versionRoot, { recursive: true });
		await writeFile(paths.models, "not a directory");

		await expect(
			validateArtifactPath(paths, join(paths.models, "weights.gguf"), "file")
		).rejects.toMatchObject({ code: "unexpected-type" });

		expect((await lstat(paths.models)).isFile()).toBe(true);
		await expect(validateArtifactPath(paths, paths.models, "directory")).rejects.toMatchObject({
			code: "unexpected-type",
		});
	});
});
