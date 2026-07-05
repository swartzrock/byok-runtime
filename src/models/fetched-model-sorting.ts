const collator = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: "base",
});

export function compareFetchedModelIds(left: string, right: string): number {
	return collator.compare(left, right);
}

export function sortFetchedModelIds(modelIds: string[]): string[] {
	return [...modelIds].sort(compareFetchedModelIds);
}
