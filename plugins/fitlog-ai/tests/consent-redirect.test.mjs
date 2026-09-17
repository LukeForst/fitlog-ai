import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("returns immediately to the OAuth client when Supabase has already approved consent", async () => {
  const source = await readFile("src/auth/consent.ts", "utf8");

  assert.match(
    source,
    /if\s*\(\s*"redirect_url"\s+in\s+data\s*\)\s*\{\s*location\.assign\(data\.redirect_url\);\s*return;/s
  );
});
