import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://utilitaire:utilitaire@localhost:5432/utilitaire",
  },
  strict: true,
  verbose: true,
});
