# FoodBridge: Real semantic matching using pgvector

Team: Sruthi Vejju (PES1UG24CS472), Shubashitha Gowtham (PES1UG24CS450)

## What this does

- **Model:** Xenova/all-MiniLM-L6-v2 via Transformers.js, run locally in Node.js.
- **Embeddings:** 384 floats, mean pooled and L2 normalized.
- **Storage:** `donations.embedding`, `ngo_requests.embedding` already exist as `vector(384)`.
- **Retrieval:** pgvector cosine distance `<=>`, sorted ascending, top 30.
- **Business rules:** Still requires same category/unit, unexpired food, open NGO request, positive remaining quantities. Reservation remains protected by the existing PostgreSQL trigger/function.
- **Fallback:** If no indexed eligible candidates, the UI explicitly says it is using category/unit matching without a vector score.
- **New records:** Try to create the vector during creation. If model inference is temporarily unavailable, donation/request creation still works and can be reindexed.
- **Existing test data:** The backfill script REPLACES synthetic vectors with real embeddings.
- **Allocations:** New reservations save a `match_score` if both records have embeddings. Old allocations are not retroactively changed.

## Install (from food-waste-web directory)

1. Copy/extract the ZIP over `food-waste-web` (overwrite included code files, but do not overwrite `.env.local`).
2. Install the model runtime:

   npm.cmd install @huggingface/transformers@3.8.1

3. Download/load the embedding model and reindex existing rows (first run requires Internet and can take time):

   node scripts/backfill-embeddings.mjs

4. Restart Next.js (`Ctrl+C`, then `npm.cmd run dev`).
5. Log in as NGO. If the previously reserved request is fully allocated, create another open request with remaining quantity; open `/allocations`.
6. Select that request and check for "Ranked using MiniLM text embeddings + PostgreSQL pgvector cosine similarity" and actual text similarity percentages.

## Troubleshooting

- Model download errors: check Internet, rerun the backfill; downloaded model files are cached by Transformers.js.
- Connection `28P01`: check `.env.local` DB_PASSWORD and DB_PORT (5433).
- `No open NGO requests with remaining quantity`: the existing 10-serving request was fully reserved. Create another NGO request for testing.
- `No matching eligible donations`: create a future-dated donation with compatible category and unit; don't change allocation state to fabricate matches.
- Next.js build issues from inference dependencies: check the terminal log; both `@huggingface/transformers` and `onnxruntime-node` are on Next.js's built-in server-external list.
- `0%` score is not a failure: the value is similarity ranking, not a probability of validity.

## Honest limitations

- This model is primarily suitable for short English food descriptions. Similarity alone is not an assurance of food safety, diet/allergen compatibility, pickup distance or expiry rules.
- An in-memory model may increase memory usage and take time on first load.
- This module does not implement MongoDB. That is the next separate stage.
- As with all generated integration code, test locally before using as the final demonstration.
