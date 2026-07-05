import { ClaudeCliProvider } from "./claude-cli-provider";
import { CodexCliProvider } from "./codex-cli-provider";
import { createByokProvider } from "./provider-factory";
import type { ByokProviderConfig, ByokProviderDeps, ByokProviderRuntime } from "../types";

export function createByokNodeProvider(
	config: ByokProviderConfig,
	deps?: Partial<ByokProviderDeps>
): ByokProviderRuntime {
	switch (config.provider) {
		case "codex-cli":
			return new CodexCliProvider({
				command: config.command,
				model: config.model,
			});
		case "claude-cli":
			return new ClaudeCliProvider({
				command: config.command,
				model: config.model,
				fetchImpl: deps?.fetchImpl,
			});
		default:
			return createByokProvider(config, deps);
	}
}
