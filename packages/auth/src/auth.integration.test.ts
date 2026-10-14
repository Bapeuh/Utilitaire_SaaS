import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { auth, authDatabaseClient } from "./server.js";

const email = `auth-smoke-${randomUUID()}@example.test`;
const password = "TestPassword123!";
const name = "Auth Smoke Test";

afterAll(async () => {
  await authDatabaseClient`delete from users where email = ${email}`;
  await authDatabaseClient.end({ timeout: 5 });
});

describe("Better Auth PostgreSQL integration", () => {
  it("signs up and signs in a user with email/password", async () => {
    const signUp = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
    });

    expect(signUp.user.email).toBe(email);
    expect(signUp.user.name).toBe(name);

    const signIn = await auth.api.signInEmail({
      body: {
        email,
        password,
      },
    });

    expect(signIn.user.email).toBe(email);
  });
});
