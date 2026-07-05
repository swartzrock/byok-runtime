import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		node: "src/node.ts",
	},
	format: ["esm"],
	dts: true,
	sourcemap: true,
	clean: true,
	target: "node24",
});
