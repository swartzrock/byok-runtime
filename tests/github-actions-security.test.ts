import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const WORKFLOW_ROOT = join(PACKAGE_ROOT, ".github", "workflows");

function readWorkflow(name: string): string {
	return readFileSync(join(WORKFLOW_ROOT, name), "utf8");
}

describe("GitHub Actions security", () => {
	it("pins every external action to a full commit SHA", () => {
		const actionPattern = /^\s*(?:-\s+)?uses:\s+([^@\s]+)@([^\s#]+)/gm;
		for (const name of readdirSync(WORKFLOW_ROOT).filter((file) => /\.ya?ml$/.test(file))) {
			const workflow = readWorkflow(name);
			for (const match of workflow.matchAll(actionPattern)) {
				expect(match[2], `${name}: ${match[1]}`).toMatch(/^[0-9a-f]{40}$/);
			}
		}
	});

	it("keeps untrusted CI unprivileged and the release token read-only", () => {
		expect(readWorkflow("ci.yml")).not.toContain("pull_request_target:");

		const release = readWorkflow("release.yml");
		expect(release).toContain("permissions:\n  contents: read\n  id-token: write");
		expect(release).not.toContain("pull-requests: write");
	});

	it("uses the Changesets v2 release inputs", () => {
		const release = readWorkflow("release.yml");

		expect(release).toContain("github-token: ${{ secrets.CHANGESETS_TOKEN }}");
		expect(release).toContain("version-script: bun run changeset:version");
		expect(release).toContain("publish-script: bun run changeset:publish");
		expect(release).toContain('commit-message: "chore: release"');
		expect(release).toContain('NPM_CONFIG_PROVENANCE: "true"');
		expect(release).not.toContain("GITHUB_TOKEN:");
	});
});
