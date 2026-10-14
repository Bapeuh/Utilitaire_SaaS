import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

export function createDatabase(connectionString: string) {
  const client = postgres(connectionString, {
    prepare: false,
  });

  return {
    client,
    db: drizzle(client, { schema }),
  };
}
