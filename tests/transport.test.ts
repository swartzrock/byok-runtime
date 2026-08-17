import { describe, expect, it, vi } from "vitest";
import { fetchFromTransport } from "../src/transport";
import type { ByokTransport } from "../src";

describe("BYOK transport", () => {
	it("normalizes fetch inputs before calling the host transport", async () => {
		const controller = new AbortController();
		const transport = vi.fn<ByokTransport>(async (request) => {
			expect(request.url).toBe("https://example.com/models");
			expect(request.method).toBe("POST");
			expect(request.headers.get("authorization")).toBe("Bearer test");
			expect(request.signal.aborted).toBe(false);
			expect(await request.text()).toBe('{"model":"test"}');
			controller.abort();
			expect(request.signal.aborted).toBe(true);
			return new Response('{"ok":true}', {
				status: 201,
				headers: { "content-type": "application/json" },
			});
		});
		const fetchImpl = fetchFromTransport(transport);

		const response = await fetchImpl("https://example.com/models", {
			method: "POST",
			headers: { Authorization: "Bearer test" },
			body: '{"model":"test"}',
			signal: controller.signal,
		});

		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({ ok: true });
		expect(transport).toHaveBeenCalledTimes(1);
	});

	it("preserves Request fields when init overrides are omitted", async () => {
		const transport = vi.fn<ByokTransport>(async (request) => {
			expect(request.method).toBe("PUT");
			expect(request.headers.get("x-test")).toBe("yes");
			expect(await request.text()).toBe("body");
			return new Response(null, { status: 204 });
		});
		const fetchImpl = fetchFromTransport(transport);
		const request = new Request("https://example.com/resource", {
			method: "PUT",
			headers: { "X-Test": "yes" },
			body: "body",
		});

		await fetchImpl(request);

		expect(transport).toHaveBeenCalledTimes(1);
	});
});
