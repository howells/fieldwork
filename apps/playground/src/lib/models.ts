// The models the header offers, as Mastra model-router ids through OpenRouter.
// Each id is listed in the installed Mastra provider registry.

export interface ModelChoice {
  /** The Mastra model-router id, `openrouter/<vendor>/<model>`. */
  id: string;
  label: string;
  note: string;
}

export const MODELS: readonly ModelChoice[] = [
  {
    id: "openrouter/openai/gpt-6-luna",
    label: "GPT-6 Luna",
    note: "Quick and cheap, right for most tasks",
  },
  {
    id: "openrouter/openai/gpt-6-sol",
    label: "GPT-6 Sol",
    note: "Plans better, a little slower",
  },
  {
    id: "openrouter/openai/gpt-6-astra",
    label: "GPT-6 Astra",
    note: "The most capable, for long research",
  },
  {
    id: "openrouter/anthropic/claude-opus-5.5",
    label: "Claude Opus 5.5",
    note: "Careful on tasks with many steps",
  },
];

export const DEFAULT_MODEL = "openrouter/openai/gpt-6-luna";

export const MODEL_IDS = MODELS.map((model) => model.id);

/** The OpenRouter id, as the menu shows it: `openai/gpt-6-luna`. */
export const routerId = (id: string): string =>
  id.replace(/^openrouter\//u, "");

export const modelLabel = (id: string): string =>
  MODELS.find((model) => model.id === id)?.label ?? routerId(id);
