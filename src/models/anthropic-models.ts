import type { ModelInfo } from "@anthropic-ai/sdk/resources/models";
import type { ByokModelOption } from "../types";

export interface AnthropicModelOption {
	id: string;
	label: string;
	description: string;
	hint: AnthropicModelHint;
}

export interface AnthropicModelHint {
	quality: string;
	speed: string;
	cost: string;
	context: string;
	generationHint: string;
}

export interface AnthropicModelListSource {
	listModels(): Promise<ByokModelOption[]>;
}

export interface AnthropicModelRefreshResult {
	availableModels: ByokModelOption[];
	options: AnthropicModelOption[];
	message: string;
}

export const ANTHROPIC_CUSTOM_MODEL_ID = "__custom__";

type AnthropicStoredModel = ModelInfo | ByokModelOption;

const GENERIC_ANTHROPIC_MODEL_HINT: AnthropicModelHint = {
	quality: "Varies",
	speed: "Varies",
	cost: "Varies",
	context: "Varies",
	generationHint: "Output quality depends on the exact custom model you enter.",
};

const EMPTY_ANTHROPIC_MODEL_HINT =
	"Fetch Anthropic models to choose from your account, or enter a custom model ID.";

const ANTHROPIC_DISCOVERED_FAMILY_ORDER = ["sonnet", "haiku", "opus", "fable"];

function compareAnthropicModelVersions(a: number[], b: number[]): number {
	const maxLength = Math.max(a.length, b.length);
	for (let index = 0; index < maxLength; index += 1) {
		const left = a[index] ?? 0;
		const right = b[index] ?? 0;
		if (left !== right) return right - left;
	}
	return 0;
}

function normalizeAnthropicModelLabel(label: string): string {
	return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseAnthropicDiscoveredModelSortKey(label: string): {
	familyIndex: number;
	version: number[];
	normalizedLabel: string;
} {
	const normalizedLabel = normalizeAnthropicModelLabel(label);
	const match = normalizedLabel.match(
		/claude\s+(sonnet|haiku|opus|fable)\s+(\d+(?:\.\d+)*)/
	);
	if (!match) {
		return {
			familyIndex: Number.MAX_SAFE_INTEGER,
			version: [],
			normalizedLabel,
		};
	}
	const familyIndex = ANTHROPIC_DISCOVERED_FAMILY_ORDER.indexOf(match[1]);
	return {
		familyIndex: familyIndex === -1 ? Number.MAX_SAFE_INTEGER : familyIndex,
		version: match[2].split(".").map((part) => Number.parseInt(part, 10) || 0),
		normalizedLabel,
	};
}

function storedModelId(model: AnthropicStoredModel): string {
	return model.id;
}

function storedModelLabel(model: AnthropicStoredModel): string {
	return "display_name" in model ? model.display_name : model.label;
}

export function anthropicModelInfoToByokModelOption(
	model: ModelInfo
): ByokModelOption {
	return {
		id: model.id,
		label: model.display_name,
	};
}

export function buildAnthropicModelOptions(
	availableModels: AnthropicStoredModel[] = []
): AnthropicModelOption[] {
	const knownIds = new Set<string>();
	const seenLabels = new Set<string>();
	const discoveredOptions: AnthropicModelOption[] = [];
	for (const model of availableModels) {
		const id = storedModelId(model);
		const label = storedModelLabel(model);
		if (knownIds.has(id)) continue;
		const normalizedLabel = normalizeAnthropicModelLabel(label);
		if (seenLabels.has(normalizedLabel)) continue;
		discoveredOptions.push({
			id,
			label,
			description: "Available from your Anthropic account.",
			hint: GENERIC_ANTHROPIC_MODEL_HINT,
		});
		knownIds.add(id);
		seenLabels.add(normalizedLabel);
	}
	discoveredOptions.sort((left, right) => {
		const leftKey = parseAnthropicDiscoveredModelSortKey(left.label);
		const rightKey = parseAnthropicDiscoveredModelSortKey(right.label);
		if (leftKey.familyIndex !== rightKey.familyIndex) {
			return leftKey.familyIndex - rightKey.familyIndex;
		}
		const versionComparison = compareAnthropicModelVersions(
			leftKey.version,
			rightKey.version
		);
		if (versionComparison !== 0) return versionComparison;
		return leftKey.normalizedLabel.localeCompare(rightKey.normalizedLabel);
	});
	return discoveredOptions;
}

function resolveAnthropicModelOption(
	modelId: string,
	availableModels: AnthropicStoredModel[] = []
): AnthropicModelOption | null {
	return (
		buildAnthropicModelOptions(availableModels).find((model) => model.id === modelId) ??
		null
	);
}

export function isAnthropicCustomModelSelection(settings: {
	anthropicModel: string;
	anthropicModelSelection?: string;
	anthropicAvailableModels?: AnthropicStoredModel[];
}): boolean {
	return (
		settings.anthropicModelSelection === ANTHROPIC_CUSTOM_MODEL_ID ||
		!resolveAnthropicModelOption(settings.anthropicModel, settings.anthropicAvailableModels)
	);
}

export function normalizeAnthropicModelSelection(settings: {
	anthropicModel: string;
	anthropicModelSelection?: string;
	anthropicAvailableModels?: AnthropicStoredModel[];
}): void {
	if (settings.anthropicModelSelection) return;
	settings.anthropicModelSelection = resolveAnthropicModelOption(
		settings.anthropicModel,
		settings.anthropicAvailableModels
	)
		? settings.anthropicModel
		: ANTHROPIC_CUSTOM_MODEL_ID;
}

export function describeAnthropicModel(
	modelId: string,
	availableModels: AnthropicStoredModel[] = []
): {
	label: string;
	rawId: string;
} {
	const model = resolveAnthropicModelOption(modelId, availableModels);
	if (model) {
		return { label: model.label, rawId: model.id };
	}
	return { label: "Custom model ID", rawId: modelId };
}

export function describeAnthropicModelDetails(
	modelId: string,
	availableModels: AnthropicStoredModel[] = []
): {
	label: string;
	rawId: string;
	hint: AnthropicModelHint;
} {
	const model = resolveAnthropicModelOption(modelId, availableModels);
	if (model) {
		return { label: model.label, rawId: model.id, hint: model.hint };
	}
	return {
		label: "Custom model ID",
		rawId: modelId,
		hint: GENERIC_ANTHROPIC_MODEL_HINT,
	};
}

export function formatAnthropicUnavailableModelMessage(
	modelId: string,
	availableModels: AnthropicStoredModel[] = []
): string {
	const model = describeAnthropicModel(modelId, availableModels);
	return `This key cannot access ${model.label} (${model.rawId}). Pick another model or check your Anthropic account.`;
}

export function formatAnthropicModelHint(
	modelId: string,
	availableModels: AnthropicStoredModel[] = []
): string {
	if (!modelId.trim() && availableModels.length === 0) return EMPTY_ANTHROPIC_MODEL_HINT;
	return "";
}

export async function refreshAnthropicModelOptions(
	source: AnthropicModelListSource | null
): Promise<AnthropicModelRefreshResult> {
	try {
		const availableModels = source ? await source.listModels() : [];
		const options = buildAnthropicModelOptions(availableModels);
		return {
			availableModels,
			options,
			message:
				availableModels.length > 0
					? `Fetched ${availableModels.length} Anthropic model${availableModels.length === 1 ? "" : "s"} from your account.`
					: "No Anthropic models were returned for this account. You can still enter a custom model ID.",
		};
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			availableModels: [],
			options: buildAnthropicModelOptions(),
			message: detail
				? `Could not fetch Anthropic models (${detail}). You can still enter a custom model ID.`
				: "Could not fetch Anthropic models. You can still enter a custom model ID.",
		};
	}
}
