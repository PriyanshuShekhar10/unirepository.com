import { MongoClient, type Db } from "mongodb";

let client: MongoClient | null = null;

export async function optionalDb(): Promise<Db | null> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.log("Mongo: MONGODB_URI unset; skipping database writes.");
    return null;
  }
  const dbName = process.env.MONGODB_DB?.trim() || "unirepository";
  client = new MongoClient(uri);
  await client.connect();
  return client.db(dbName);
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}
