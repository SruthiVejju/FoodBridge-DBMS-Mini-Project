import { MongoClient, type Db } from "mongodb";

type MongoCache = { promise?: Promise<MongoClient>; indexes?: Promise<void> };
const globals = globalThis as typeof globalThis & { __foodbridgeMongo?: MongoCache };
const cache = (globals.__foodbridgeMongo ??= {});

function mongoUri(): string {
  const names = ["MONGODB_HOST", "MONGODB_PORT", "MONGODB_USER", "MONGODB_PASSWORD", "MONGODB_DB", "MONGODB_AUTH_DB"] as const;
  for (const name of names) {
    if (!process.env[name]) throw new Error(`Missing MongoDB setting: ${name}`);
  }
  const user = encodeURIComponent(process.env.MONGODB_USER!);
  const password = encodeURIComponent(process.env.MONGODB_PASSWORD!);
  const host = process.env.MONGODB_HOST!;
  const port = Number(process.env.MONGODB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid MONGODB_PORT");
  const authDb = encodeURIComponent(process.env.MONGODB_AUTH_DB!);
  return `mongodb://${user}:${password}@${host}:${port}/?authSource=${authDb}&directConnection=true`;
}

export async function getMongoDb(): Promise<Db> {
  if (!cache.promise) {
    const client = new MongoClient(mongoUri(), {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
    });
    cache.promise = client.connect().catch((err: unknown) => {
      cache.promise = undefined;
      void client.close();
      throw err;
    });
  }
  const client = await cache.promise;
  return client.db(process.env.MONGODB_DB!);
}

export async function ensureMongoIndexes(): Promise<void> {
  if (!cache.indexes) {
    cache.indexes = (async () => {
      const mongo = await getMongoDb();
      await Promise.all([
        mongo.collection("pickup_activity").createIndex({ event_key: 1 }, { unique: true }),
        mongo.collection("pickup_activity").createIndex({ donor_org_id: 1, observed_at: -1 }),
        mongo.collection("pickup_activity").createIndex({ ngo_org_id: 1, observed_at: -1 }),
        mongo.collection("food_inspections").createIndex({ donation_id: 1, checked_at: -1 }),
      ]);
    })().catch((error: unknown) => {
      cache.indexes = undefined;
      throw error;
    });
  }
  return cache.indexes;
}
