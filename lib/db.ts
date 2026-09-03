import { MongoClient, type Db } from "mongodb";

const MONGODB_URI_ENV = "MONGODB_URI";
const MONGODB_DB_NAME_ENV = "MONGODB_DB_NAME";

export class DatabaseConnectionError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DatabaseConnectionError";
  }
}

function getMongoUri(): string {
  const uri = process.env[MONGODB_URI_ENV];

  if (!uri) {
    throw new DatabaseConnectionError(
      `Missing ${MONGODB_URI_ENV} environment variable. Copy .env.example to .env.local and set your MongoDB connection string.`,
    );
  }

  return uri;
}

function getDbName(): string | undefined {
  return process.env[MONGODB_DB_NAME_ENV] || "ai-revenue-recovery";
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

async function createClientPromise(): Promise<MongoClient> {
  const uri = getMongoUri();
  const client = new MongoClient(uri);

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  global._mongoClientPromise = undefined;
  const message =
    lastError instanceof Error ? lastError.message : "Failed to connect to MongoDB";
  throw new DatabaseConnectionError(message, lastError);
}

function getClientPromise(): Promise<MongoClient> {
  if (!global._mongoClientPromise) {
    global._mongoClientPromise = createClientPromise();
  }

  return global._mongoClientPromise;
}

export async function connectToDatabase(): Promise<{
  client: MongoClient;
  db: Db;
}> {
  try {
    const client = await getClientPromise();
    const db = client.db(getDbName());

    return { client, db };
  } catch (error) {
    if (error instanceof DatabaseConnectionError) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Failed to connect to MongoDB";

    throw new DatabaseConnectionError(message, error);
  }
}

export async function getDb(): Promise<Db> {
  const { db } = await connectToDatabase();
  return db;
}

export async function pingDatabase(): Promise<{
  ok: true;
  database: string;
}> {
  const { db } = await connectToDatabase();

  try {
    await db.command({ ping: 1 });
    return { ok: true, database: db.databaseName };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "MongoDB ping command failed";

    throw new DatabaseConnectionError(message, error);
  }
}
