/**
 * One-time / repeatable model-based indexing for ALL donations and NGO requests.
 * Run from food-waste-web: node scripts/backfill-embeddings.mjs
 * Replaces any synthetic test vectors from sample_data_and_tests.sql.
 * Does NOT change any table/relationship, quantity, allocation, or pickup.
 */
import { createRequire } from 'node:module';
import pg from 'pg';
import { pipeline } from '@huggingface/transformers';

const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd());

const required = ['DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing ${key} in .env.local`);
}

const client = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 10000,
});

const modelId = 'Xenova/all-MiniLM-L6-v2';
console.log(`Loading ${modelId} (384 dimensions). First run downloads model files.`);
const embedder = await pipeline('feature-extraction', modelId, { dtype: 'q8' });

async function embed(text) {
  const output = await embedder(text.slice(0,1600), { pooling:'mean', normalize:true });
  const vector = Array.from(output.data, Number);
  if (vector.length !== 384 || vector.some(v => !Number.isFinite(v))) {
    throw new Error('Expected a finite 384-dimensional MiniLM embedding.');
  }
  return `[${vector.join(',')}]`;
}

try {
  await client.connect();
  const donations = await client.query(
    'SELECT donation_id, food_name, category, description FROM donations ORDER BY donation_id'
  );
  const requests = await client.query(
    'SELECT request_id, category, description FROM ngo_requests ORDER BY request_id'
  );
  console.log(`Indexing ${donations.rowCount} donations and ${requests.rowCount} NGO requests...`);
  for (const row of donations.rows) {
    const text = `Food category: ${row.category}. Food: ${row.food_name}. Description: ${row.description}`;
    const embedding = await embed(text);
    await client.query('UPDATE donations SET embedding=$1::vector(384) WHERE donation_id=$2', [embedding,row.donation_id]);
    console.log(`Indexed donation #${row.donation_id}`);
  }
  for (const row of requests.rows) {
    const text = `Food category: ${row.category}. Food: ${row.description}`;
    const embedding = await embed(text);
    await client.query('UPDATE ngo_requests SET embedding=$1::vector(384) WHERE request_id=$2', [embedding,row.request_id]);
    console.log(`Indexed NGO request #${row.request_id}`);
  }
  const counts = await client.query(`
    SELECT (SELECT COUNT(*) FROM donations WHERE embedding IS NOT NULL) AS donations_indexed,
           (SELECT COUNT(*) FROM ngo_requests WHERE embedding IS NOT NULL) AS requests_indexed
  `);
  console.log('SEMANTIC INDEXING COMPLETE:', counts.rows[0]);
  console.log('The pgvector HNSW indexes already exist; no schema migration is necessary.');
} catch (error) {
  console.error('Semantic indexing failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
