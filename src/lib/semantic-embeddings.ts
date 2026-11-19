// Server-only: one semantic embedding model for both donations and NGO requests.
// Xenova/all-MiniLM-L6-v2 produces 384-dimensional embeddings (matching schema.sql).
import "server-only";
import { pipeline } from "@huggingface/transformers";

const MODEL = "Xenova/all-MiniLM-L6-v2";

async function createExtractor() {
  return pipeline("feature-extraction", MODEL, { dtype: "q8" });
}

// Cache the loading promise so concurrent calls do not download/reload the model.
let modelPromise: ReturnType<typeof createExtractor> | undefined;

export function donationText(foodName: string, category: string, description: string): string {
  return `Food category: ${category}. Food: ${foodName}. Description: ${description}`.slice(0, 1600);
}

export function ngoRequestText(category: string, description: string): string {
  return `Food category: ${category}. Food: ${description}`.slice(0, 1600);
}

export async function createEmbedding(text: string): Promise<string> {
  modelPromise ??= createExtractor();
  let model;
  try {
    model = await modelPromise;
  } catch (error) {
    modelPromise = undefined; // permit retry if model load/download fails
    throw error;
  }
  const result = await model(text, { pooling: "mean", normalize: true });
  const values = Array.from(result.data, (value) => Number(value));
  if (values.length !== 384 || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Embedding model returned an invalid vector of length ${values.length}`);
  }
  // pgvector accepts a bracketed numeric array as a parameterized vector literal.
  return `[${values.join(",")}]`;
}
