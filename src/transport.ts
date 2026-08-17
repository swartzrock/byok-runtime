import { ByokProviderError, type ByokProviderDeps, type ByokTransport } from "./types";

function globalTransport(): ByokTransport | undefined {
	const fetchImpl = globalThis.fetch;
	if (typeof fetchImpl !== "function") return undefined;
	return Object.assign((request: Request) => fetchImpl.call(globalThis, request), {
		supportsStreaming: true,
	});
}

export function fetchFromTransport(transport: ByokTransport): typeof fetch {
	return async (input, init) => transport(new Request(input, init));
}

export function resolveByokTransport(
	deps: Partial<ByokProviderDeps> | undefined
): Pick<ByokProviderDeps, "transport"> {
	const transport = deps?.transport ?? globalTransport();
	if (!transport) {
		throw new ByokProviderError(
			"BYOK requires an HTTP transport. Pass deps.transport in this runtime."
		);
	}
	return { transport };
}
