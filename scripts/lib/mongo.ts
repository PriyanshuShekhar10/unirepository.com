import { MongoClient, type Db } from "mongodb";

let client: MongoClient | null = null;
let skipped = false;

export async function optionalDb(): Promise<Db | null> {
  if (skipped) return null;
  if (client) return client.db(process.env.MONGODB_DB?.trim() || "unirepository");
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.log("Mongo: MONGODB_URI unset; skipping database writes.");
    skipped = true;
    return null;
  }
  const dbName = process.env.MONGODB_DB?.trim() || "unirepository";
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    return client.db(dbName);
  } catch (err) {
    console.log(
      `Mongo: connect failed, skipping writes (${err instanceof Error ? err.message : err})`,
    );
    skipped = true;
    client = null;
    return null;
  }
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}
