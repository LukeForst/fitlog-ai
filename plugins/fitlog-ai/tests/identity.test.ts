import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationError, createIdentityVerifier } from "../src/auth/identity.ts";

test("returns a normalized verified owner context", async () => {
  const verify = createIdentityVerifier({
    allowedEmail: "me@example.com",
    getUser: async () => ({ id: "user-1", email: " Me@Example.com " })
  });

  const auth = await verify("token-1");

  assert.deepEqual(auth.extra?.owner, { id: "user-1", email: "me@example.com", accessToken: "token-1" });
});

test("rejects an absent or invalid bearer token", async () => {
  const verify = createIdentityVerifier({
    allowedEmail: "me@example.com",
    getUser: async () => null
  });

  await assert.rejects(verify(""), AuthorizationError);
  await assert.rejects(verify("invalid-token"), AuthorizationError);
});

test("rejects a verified user outside the single-user allowlist", async () => {
  const verify = createIdentityVerifier({
    allowedEmail: "me@example.com",
    getUser: async () => ({ id: "user-2", email: "other@example.com" })
  });

  await assert.rejects(verify("token-2"), (error: unknown) => error instanceof AuthorizationError && error.status === 403);
});
