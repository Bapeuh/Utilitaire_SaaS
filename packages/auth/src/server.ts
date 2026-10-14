import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { createDatabase, databaseSchema } from "@utilitaire/database";
import { betterAuth } from "better-auth";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://utilitaire:utilitaire@localhost:5432/utilitaire";

const { client, db } = createDatabase(databaseUrl);

export const authDatabaseClient = client;

export const auth: ReturnType<typeof betterAuth> = betterAuth({
  appName: "Utilitaire SaaS",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  trustedOrigins: [process.env.WEB_URL ?? "http://localhost:5173"],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: databaseSchema,
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
  },
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
