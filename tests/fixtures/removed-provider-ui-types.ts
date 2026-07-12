import type * as PublicApi from "../../src";

// @ts-expect-error Provider settings UI metadata is host-owned.
export type RemovedCredentialField = PublicApi.ByokCredentialFieldDefinition;
// @ts-expect-error Provider settings UI metadata is host-owned.
export type RemovedCredentialKind = PublicApi.ByokCredentialKind;
// @ts-expect-error Provider settings UI metadata is host-owned.
export type RemovedModelBehavior = PublicApi.ByokModelBehavior;
// @ts-expect-error Provider settings UI metadata is host-owned.
export type RemovedModelField = PublicApi.ByokModelFieldDefinition;
// @ts-expect-error Provider settings UI metadata is host-owned.
export type RemovedProviderDefinition = PublicApi.ByokProviderDefinition;
// @ts-expect-error Provider icons are not part of the runtime API.
export type RemovedProviderIconDefinition = PublicApi.ByokProviderIconDefinition;
// @ts-expect-error Provider icons are not part of the runtime API.
export type RemovedProviderIconSource = PublicApi.ByokProviderIconSource;
