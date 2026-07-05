import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
	root: packageRoot,
	test: {
		environment: "node",
		include: ["tests/**/*.test.ts"],
	},
});
