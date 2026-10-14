import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as coreSchema from "./schema.js";
import * as transverseSchema from "./transverse.js";

const schema = { ...coreSchema, ...transverseSchema };

export function createDatabase(connectionString: string) {
  const client = postgres(connectionString, {
    prepare: false,
  });

  return {
    client,
    db: drizzle(client, { schema }),
  };
}
