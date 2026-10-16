import { createDatabase } from "@utilitaire/database";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://utilitaire:utilitaire@localhost:5432/utilitaire";

export const { client: apiDatabaseClient, db: apiDatabase } = createDatabase(databaseUrl);
