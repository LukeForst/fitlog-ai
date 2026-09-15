# FitLog Cloud Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FitLog a secure, persistent Supabase-backed MCP service that a single allowed user can connect to from ChatGPT through OAuth 2.1.

**Architecture:** Keep SQLite for local development but make the storage, service, and tool layers asynchronous. In cloud mode, each MCP request validates its Supabase OAuth token, resolves a caller identity, and creates a Supabase repository that uses that caller's token so database RLS enforces row ownership. Render hosts the MCP endpoint, OAuth consent page, protected-resource metadata, and health check.

**Tech Stack:** Node.js 24, TypeScript strict mode, node:test, @modelcontextprotocol/sdk, @supabase/supabase-js, Supabase Postgres/Auth OAuth 2.1, Vite, Render Blueprint.

**Spec:** `docs/superpowers/specs/2026-09-15-fitlog-cloud-runtime-design.md`

## Global Constraints

- Keep all product source under `plugins/fitlog-ai/`; deploy from that package through `render.yaml` at repository root.
- In cloud mode, never use SQLite, a database password, a Supabase service-role key, a fixed owner ID, or a model-provided user ID.
- The only production identity source is a verified Supabase Bearer token; its email must exactly match `FITLOG_ALLOWED_EMAIL` after trim-and-lowercase normalization.
- Use the caller's OAuth access token for every Supabase data request so RLS remains active.
- `fitlog_users.id` equals `auth.uid()` and all business rows are isolated by RLS.
- A successful workout response means the workout, every exercise, and every set were written in one database transaction.
- Never log access tokens, email OTPs, Authorization headers, database URLs, prompts, ChatGPT transcripts, or raw meal images.
- Preserve local developer behavior with `FITLOG_OWNER_EMAIL` and SQLite; production startup fails closed when required cloud configuration is absent.
- Every behavior change begins with a focused failing test, followed by a passing focused test and the full test suite.

---

## File Structure

```text
render.yaml
plugins/fitlog-ai/
  package.json
  vite.config.ts
  README.md
  src/
    auth/{identity.ts,consent.html,consent.ts}
    http/{routes.ts,server.ts}
    storage/{repository.ts,sqlite-repository.ts,supabase-repository.ts}
    services/{record-service.ts,dashboard-service.ts,retention-service.ts}
    mcp/{server.ts,tools.ts}
    index.ts
  tests/
    {sqlite-repository,record-service,dashboard-service,retention-service,
     mcp-tools,supabase-repository,identity,http-routes}.test.ts
supabase/migrations/002_fitlog_rls_and_workout_rpc.sql
```

`OwnerContext` is the only owner value passed below the HTTP boundary:

```ts
export interface OwnerContext { id: string; email: string; accessToken?: string; }
export interface FitLogRepository {
  saveWorkout(owner: OwnerContext, workout: WorkoutInput): Promise<string>;
  saveMeal(owner: OwnerContext, meal: MealInput): Promise<string>;
  saveBodyMeasurement(owner: OwnerContext, measurement: BodyMeasurementInput): Promise<string>;
  saveMemoryFact(owner: OwnerContext, fact: MemoryFactInput): Promise<string>;
  listWorkouts(owner: OwnerContext, from: string, to: string): Promise<StoredWorkout[]>;
  listMeals(owner: OwnerContext, from: string, to: string): Promise<StoredMeal[]>;
  listMeasurements(owner: OwnerContext, from: string, to: string): Promise<StoredBodyMeasurement[]>;
  listMemoryFacts(owner: OwnerContext): Promise<StoredMemoryFact[]>;
  deleteMemoryFact(owner: OwnerContext, id: string): Promise<boolean>;
  writeAuditEvent(owner: OwnerContext, action: string, metadata?: Record<string, unknown>, createdAt?: string): Promise<void>;
  purgeAuditEventsBefore(owner: OwnerContext, cutoff: string): Promise<number>;
  countAuditEvents(owner: OwnerContext): Promise<number>;
  close(): Promise<void>;
}

export interface RepositoryFactory {
  forOwner(owner: OwnerContext): FitLogRepository;
}
```

### Task 1: Convert the local persistence seam to asynchronous owner contexts

**Files:**

- Modify: `plugins/fitlog-ai/src/storage/repository.ts`
- Modify: `plugins/fitlog-ai/src/storage/sqlite-repository.ts`
- Modify: `plugins/fitlog-ai/src/services/{record-service,dashboard-service,retention-service}.ts`
- Modify: `plugins/fitlog-ai/tests/{sqlite-repository,record-service,dashboard-service,retention-service}.test.ts`

**Interfaces:**

- Consumes: existing validated `WorkoutInput`, `MealInput`, `BodyMeasurementInput`, and `MemoryFactInput`.
- Produces: `OwnerContext`, asynchronous `FitLogRepository`, and `createLocalRepositoryFactory(ownerEmail)`.
- Preserves: existing returned IDs, record payloads, validation texts, audit behavior, and SQLite owner isolation.

- [ ] **Step 1: Write the failing asynchronous SQLite repository test.**

Change the happy-path test to await the repository and pass an `OwnerContext`:

```ts
const owner = { id: "fitlog-owner", email: "me@example.com" };
const repo = createSqliteRepository(":memory:", owner.email);
const id = await repo.saveWorkout(owner, workout);
const rows = await repo.listWorkouts(owner, "2026-09-14", "2026-09-14");
assert.equal(rows[0]?.id, id);
```

Add the isolation assertion with `{ id: "other", email: "other@example.com" }` and `await assert.rejects(...)` matching `/not authorized/`.

- [ ] **Step 2: Verify the test fails for the intended reason.**

Run:

```powershell
Set-Location E:\FitLog\fitlog-plugin\plugins\fitlog-ai
node --test tests/sqlite-repository.test.ts
```

Expected: TypeScript/runtime failure because repository methods still accept strings and return synchronous values.

- [ ] **Step 3: Change only the repository contracts and SQLite adapter.**

Add `OwnerContext` and `RepositoryFactory` to `repository.ts`. Change every `FitLogRepository` method to return `Promise`. Have `SqliteRepository` keep its synchronous SQL internally but expose `async` methods. Validate `owner.email` against the configured local email; local `owner.id` is ignored after type validation. Add:

```ts
export function createLocalRepositoryFactory(ownerEmail: string): RepositoryFactory {
  const repository = createSqliteRepository(process.env.FITLOG_SQLITE_PATH ?? "./fitlog.local.db", ownerEmail);
  return { forOwner: () => repository };
}
```

Keep the actual database path injectable for tests rather than reading process state inside tests.

- [ ] **Step 4: Update services with awaited repository calls.**

Change public service methods to return promises and await persistence before returning their result:

```ts
async recordWorkout(owner: OwnerContext, input: unknown) {
  const workout = parseWorkoutInput(input);
  const id = await repository.saveWorkout(owner, workout);
  await repository.writeAuditEvent(owner, "workout.recorded", { recordId: id, timestamp: new Date().toISOString() });
  return { id, volumeKg: calculateWorkoutVolume(workout.exercises), workout };
}
```

Apply the same pattern to meals, measurements, memory facts, dashboard lists, and retention cleanup.

- [ ] **Step 5: Verify green, then run the local regression suite.**

Run:

```powershell
node --test tests/sqlite-repository.test.ts tests/record-service.test.ts tests/dashboard-service.test.ts tests/retention-service.test.ts
npm run check
```

Expected: all selected tests pass and TypeScript has no errors.

- [ ] **Step 6: Commit the isolated asynchronous seam.**

```powershell
git add plugins/fitlog-ai/src/storage plugins/fitlog-ai/src/services plugins/fitlog-ai/tests
git commit -m "refactor: make FitLog storage asynchronous"
```

### Task 2: Add Supabase RLS and transactional workout storage

**Files:**

- Create: `supabase/migrations/002_fitlog_rls_and_workout_rpc.sql`
- Create: `plugins/fitlog-ai/src/storage/supabase-repository.ts`
- Create: `plugins/fitlog-ai/tests/supabase-repository.test.ts`
- Modify: `plugins/fitlog-ai/package.json`
- Modify: `plugins/fitlog-ai/package-lock.json`

**Interfaces:**

- Consumes: `OwnerContext` with `id`, `email`, and OAuth `accessToken`.
- Produces: `createSupabaseRepositoryFactory(config)` and an RLS-safe repository for one request owner.
- Requires: `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.

- [ ] **Step 1: Write the failing request-scoped repository tests.**

Use a fake `fetch` function injected into the Supabase client. Assert a workout request calls the RPC endpoint with the exact caller token and all nested sets:

```ts
const calls: Request[] = [];
const factory = createSupabaseRepositoryFactory({
  url: "https://example.supabase.co",
  publishableKey: "publishable-test",
  fetch: async (input, init) => {
    calls.push(new Request(input, init));
    return Response.json("workout-1");
  }
});
await factory.forOwner(owner).saveWorkout(owner, workout);
assert.equal(calls[0]?.headers.get("authorization"), `Bearer ${owner.accessToken}`);
assert.match(calls[0]?.url ?? "", /\/rest\/v1\/rpc\/fitlog_record_workout$/);
```

Add a test that a context without `accessToken` rejects before a request is issued, and a static migration test that checks for `auth.users`, `create policy`, and `fitlog_record_workout`.

- [ ] **Step 2: Verify red.**

Run:

```powershell
node --test tests/supabase-repository.test.ts
```

Expected: module-not-found error for `supabase-repository.ts`.

- [ ] **Step 3: Add the dependency and implement the migration.**

Install the official client from the plugin package:

```powershell
npm install @supabase/supabase-js
```

In `002_fitlog_rls_and_workout_rpc.sql`, make `fitlog_users.id` reference `auth.users(id)`, then add named select/insert/update/delete policies for each table. Use `owner_id = auth.uid()` for direct owner tables and `exists` ownership checks for `exercises` and `workout_sets`.

Define a `security invoker` PostgreSQL function whose input is a JSONB workout and whose output is UUID:

```sql
create or replace function public.fitlog_record_workout(payload jsonb)
returns uuid
language plpgsql
security invoker
as $$
declare
  workout_id uuid := gen_random_uuid();
  exercise jsonb;
  exercise_index integer;
  set_item jsonb;
  set_index integer;
  exercise_id uuid;
begin
  insert into public.workouts (id, owner_id, date, title, note, volume_kg)
  values (workout_id, auth.uid(), (payload->>'date')::date, payload->>'title', payload->>'note', (payload->>'volumeKg')::numeric);
  for exercise, exercise_index in
    select value, ordinal::integer - 1
    from jsonb_array_elements(payload->'exercises') with ordinality
  loop
    exercise_id := gen_random_uuid();
    insert into public.exercises (id, workout_id, name, position)
    values (exercise_id, workout_id, exercise->>'name', exercise_index);
    for set_item, set_index in
      select value, ordinal::integer - 1
      from jsonb_array_elements(exercise->'sets') with ordinality
    loop
      insert into public.workout_sets (id, exercise_id, position, weight_kg, reps)
      values (gen_random_uuid(), exercise_id, set_index, (set_item->>'weightKg')::numeric, (set_item->>'reps')::integer);
    end loop;
  end loop;
  return workout_id;
end;
$$;
```

Use `jsonb_array_elements(... ) with ordinality` or a PL/pgSQL loop to retain source order. Validate all required JSON fields in the function and raise a safe exception for malformed payloads.

- [ ] **Step 4: Implement the Supabase repository.**

Create an anonymous-key Supabase client per owner with `persistSession: false`, `autoRefreshToken: false`, injected `fetch`, and an `Authorization: Bearer <owner.accessToken>` global header. Before inserts, upsert `{ id: owner.id, email: owner.email }` into `fitlog_users`; RLS makes this user-scoped. Use RPC for `saveWorkout`, normal typed inserts for one-row records, and ordered selects for history methods.

Map PostgREST snake_case columns to existing `Stored*` TypeScript objects in one private mapping function per record type. Never accept an ID from a tool input for `owner_id`.

- [ ] **Step 5: Verify green and type-check.**

Run:

```powershell
node --test tests/supabase-repository.test.ts
npm run check
```

Expected: tests prove caller-token forwarding and migration requirements; TypeScript passes.

- [ ] **Step 6: Commit the cloud storage layer.**

```powershell
git add supabase/migrations/002_fitlog_rls_and_workout_rpc.sql plugins/fitlog-ai/package.json plugins/fitlog-ai/package-lock.json plugins/fitlog-ai/src/storage/supabase-repository.ts plugins/fitlog-ai/tests/supabase-repository.test.ts
git commit -m "feat: add Supabase RLS storage"
```

### Task 3: Authenticate MCP requests and publish OAuth resource metadata

**Files:**

- Create: `plugins/fitlog-ai/src/auth/identity.ts`
- Create: `plugins/fitlog-ai/src/http/routes.ts`
- Create: `plugins/fitlog-ai/tests/identity.test.ts`
- Create: `plugins/fitlog-ai/tests/http-routes.test.ts`

**Interfaces:**

- Produces: `createIdentityVerifier`, `requireOwner`, `protectedResourceMetadata`, and `createHttpRequestHandler`.
- Consumes: `FITLOG_PUBLIC_URL`, `FITLOG_ALLOWED_EMAIL`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY`.
- Returns: `AuthInfo` with `extra.owner` containing a validated `OwnerContext`.

- [ ] **Step 1: Write failing authentication and metadata tests.**

Use an injected `getUser(token)` dependency to avoid network calls. Cover valid owner, missing Bearer token, invalid token, and an email that differs only by an unauthorized address:

```ts
const verify = createIdentityVerifier({
  allowedEmail: "me@example.com",
  getUser: async () => ({ id: "user-1", email: "me@example.com" })
});
const auth = await verify("token-1");
assert.deepEqual(auth.extra?.owner, { id: "user-1", email: "me@example.com", accessToken: "token-1" });
```

For HTTP, assert unauthenticated `/mcp` returns 401 and contains:

```ts
WWW-Authenticate: Bearer resource_metadata="https://fitlog.example/.well-known/oauth-protected-resource"
```

Assert `/.well-known/oauth-protected-resource` returns the canonical resource URL and `https://dxgsfassloqunvvubkgu.supabase.co/auth/v1` authorization server.

- [ ] **Step 2: Verify red.**

Run:

```powershell
node --test tests/identity.test.ts tests/http-routes.test.ts
```

Expected: module-not-found errors for `identity.ts` and `routes.ts`.

- [ ] **Step 3: Implement verified identity resolution.**

`createIdentityVerifier` receives a `getUser` implementation. Its production constructor creates a Supabase Auth client and calls `auth.getUser(accessToken)`. Reject missing user IDs/emails and non-matching normalized emails with a dedicated `AuthorizationError` containing only a safe public message.

Create `AuthInfo` as follows:

```ts
return {
  token: accessToken,
  clientId: "chatgpt",
  scopes: ["openid", "email", "profile"],
  extra: { owner: { id: user.id, email: normalizeEmail(user.email), accessToken } }
};
```

- [ ] **Step 4: Implement HTTP metadata and challenge routes.**

`createHttpRequestHandler` must serve `/healthz` with `200 {"status":"ok"}`, serve exact RFC 9728 metadata at the well-known path, and authenticate every `/mcp` request before assigning `request.auth` and calling `transport.handleRequest(request, response)`. Do not parse or log bodies before authentication. Return 403 for an authorized token belonging to another email and 500 only with `{"error":"service unavailable"}` for unexpected failures.

- [ ] **Step 5: Verify green.**

Run:

```powershell
node --test tests/identity.test.ts tests/http-routes.test.ts
npm run check
```

Expected: all auth cases and both public HTTP routes pass.

- [ ] **Step 6: Commit request authentication.**

```powershell
git add plugins/fitlog-ai/src/auth plugins/fitlog-ai/src/http plugins/fitlog-ai/tests/identity.test.ts plugins/fitlog-ai/tests/http-routes.test.ts
git commit -m "feat: authenticate FitLog MCP requests"
```

### Task 4: Bind tools to the authenticated request owner

**Files:**

- Modify: `plugins/fitlog-ai/src/mcp/server.ts`
- Modify: `plugins/fitlog-ai/src/mcp/tools.ts`
- Modify: `plugins/fitlog-ai/tests/mcp-tools.test.ts`

**Interfaces:**

- Consumes: `RequestHandlerExtra.authInfo.extra.owner` and `RepositoryFactory`.
- Produces: async tools that cannot run in cloud mode without an authenticated `OwnerContext`.

- [ ] **Step 1: Write the failing MCP authenticated-owner test.**

Build the server with a factory that records the requested owner. Send an in-memory tool call with transport auth metadata and verify the factory received the expected ID and email:

```ts
assert.deepEqual(seenOwners, [{ id: "user-1", email: "me@example.com", accessToken: "token-1" }]);
```

Add a tool-call test with no `authInfo` in cloud mode and assert it returns a safe authorization failure rather than accessing the repository.

- [ ] **Step 2: Verify red.**

Run:

```powershell
node --test tests/mcp-tools.test.ts
```

Expected: the existing fixed `ownerEmail` behavior causes the new owner-context assertion to fail.

- [ ] **Step 3: Implement request-scoped tool dependencies.**

Replace `FitlogToolDependencies.ownerEmail` and a singleton repository with:

```ts
export interface FitlogToolDependencies {
  repositoryFactory: RepositoryFactory;
  mode: "local" | "cloud";
  localOwner?: OwnerContext;
}
```

Implement `ownerFromExtra(extra, dependencies)`: local mode returns `localOwner`; cloud mode validates the `extra.authInfo?.extra?.owner` shape and throws `AuthorizationError` otherwise. Each tool awaits `repositoryFactory.forOwner(owner)` and creates/uses services for that request. Keep the existing tool names, schemas, text responses, structured results, and dashboard resource URI.

- [ ] **Step 4: Verify green and run all MCP-related tests.**

Run:

```powershell
node --test tests/mcp-tools.test.ts tests/record-service.test.ts tests/dashboard-service.test.ts
npm run check
```

Expected: local in-memory calls still work and cloud calls use the authenticated owner.

- [ ] **Step 5: Commit authenticated tool binding.**

```powershell
git add plugins/fitlog-ai/src/mcp plugins/fitlog-ai/tests/mcp-tools.test.ts
git commit -m "feat: scope FitLog tools to OAuth identity"
```

### Task 5: Build the Supabase OAuth consent page and cloud runtime bootstrap

**Files:**

- Create: `plugins/fitlog-ai/src/auth/consent.html`
- Create: `plugins/fitlog-ai/src/auth/consent.ts`
- Modify: `plugins/fitlog-ai/vite.config.ts`
- Modify: `plugins/fitlog-ai/src/index.ts`
- Modify: `plugins/fitlog-ai/tests/http-routes.test.ts`

**Interfaces:**

- Produces: `GET /oauth/consent` and a browser bundle that calls Supabase `getAuthorizationDetails`, `approveAuthorization`, and `denyAuthorization`.
- Requires: public `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` only; no secret is embedded in browser output.

- [ ] **Step 1: Write the failing consent-route test.**

Extend HTTP tests to request `/oauth/consent?authorization_id=auth-1` and assert status 200, `text/html`, the `authorization_id` query handling code, and no service-role key text. Add a build assertion that both dashboard and consent assets exist in `dist`.

- [ ] **Step 2: Verify red.**

Run:

```powershell
node --test tests/http-routes.test.ts
npm run build
```

Expected: the HTML route and consent build asset are absent.

- [ ] **Step 3: Implement the consent page.**

The page must:

1. Reject a missing `authorization_id` with readable Chinese text.
2. Present an email form that calls `supabase.auth.signInWithOtp` with a redirect back to the same consent URL.
3. After a session exists, call `supabase.auth.oauth.getAuthorizationDetails(authorizationId)`.
4. Render requesting client name, exact redirect URI, and each space-separated scope.
5. On approve, call `approveAuthorization` then navigate to `data.redirect_url`; on deny, do the same with `denyAuthorization`.
6. Show safe error text but never render a token, OTP, or full Supabase error object.

Use an injected JSON config endpoint `/oauth/consent-config` containing only `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`; this avoids baking environment-specific values into a reusable bundle.

- [ ] **Step 4: Switch runtime bootstrap by mode.**

In `index.ts`, parse one typed runtime configuration. Local mode needs `FITLOG_OWNER_EMAIL` and SQLite path. Cloud mode requires `FITLOG_PUBLIC_URL`, `FITLOG_ALLOWED_EMAIL`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY`; construct the identity verifier, Supabase factory, MCP server, stateless transport, and HTTP route handler. Bind the listener to Render's `PORT` and log only the port and mode.

- [ ] **Step 5: Verify green.**

Run:

```powershell
node --test tests/http-routes.test.ts
npm run build
npm run check
```

Expected: consent route and both UI assets build; no TypeScript errors.

- [ ] **Step 6: Commit OAuth UI and runtime bootstrap.**

```powershell
git add plugins/fitlog-ai/src/auth plugins/fitlog-ai/src/index.ts plugins/fitlog-ai/vite.config.ts plugins/fitlog-ai/tests/http-routes.test.ts
git commit -m "feat: add FitLog OAuth consent runtime"
```

### Task 6: Add Render deployment configuration and operator instructions

**Files:**

- Create: `render.yaml`
- Modify: `plugins/fitlog-ai/README.md`
- Modify: `plugins/fitlog-ai/package.json`
- Modify: `plugins/fitlog-ai/tests/package.test.mjs`

**Interfaces:**

- Produces: a Render Blueprint whose root is `plugins/fitlog-ai`, a production build/start command, and an operator checklist for Supabase OAuth setup.

- [ ] **Step 1: Write failing deployment metadata tests.**

Add a test that reads `../../render.yaml` and asserts it contains one web service with:

```js
assert.match(render, /rootDir:\s*plugins\/fitlog-ai/);
assert.match(render, /healthCheckPath:\s*\/healthz/);
assert.match(render, /FITLOG_RUNTIME/);
```

Assert the README documents the exact four Supabase console changes: OAuth Server enabled, dynamic client registration enabled, Site URL set to Render, and `/oauth/consent` configured as Authorization Path.

- [ ] **Step 2: Verify red.**

Run:

```powershell
node --test tests/package.test.mjs
```

Expected: failure because `render.yaml` does not exist.

- [ ] **Step 3: Add production configuration and docs.**

Create `render.yaml`:

```yaml
services:
  - type: web
    name: fitlog-ai
    runtime: node
    plan: free
    rootDir: plugins/fitlog-ai
    buildCommand: npm ci && npm run check && npm run build
    startCommand: npm run start
    healthCheckPath: /healthz
    envVars:
      - key: NODE_ENV
        value: production
      - key: FITLOG_RUNTIME
        value: cloud
      - key: FITLOG_PUBLIC_URL
        sync: false
      - key: FITLOG_ALLOWED_EMAIL
        sync: false
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_PUBLISHABLE_KEY
        sync: false
```

Set Node engine to `>=22.18` in `package.json`. In the README, provide exact dashboard navigation and environment-variable names, explicitly tell the operator to apply migration `002` in Supabase SQL Editor, and state that database passwords and service-role keys must not be entered in Render.

- [ ] **Step 4: Verify green.**

Run:

```powershell
node --test tests/package.test.mjs
npm run check
npm run build
```

Expected: deployment metadata test, type-check, and UI build all pass.

- [ ] **Step 5: Commit deployment readiness artifacts.**

```powershell
git add render.yaml plugins/fitlog-ai/README.md plugins/fitlog-ai/package.json plugins/fitlog-ai/tests/package.test.mjs
git commit -m "feat: add FitLog Render deployment config"
```

### Task 7: Perform full verification and hand off Supabase/Render setup

**Files:**

- Modify only if verification identifies a real defect: the minimal files required to fix it.

**Interfaces:**

- Verifies: local mode, cloud-mode fail-closed configuration, OAuth metadata, RLS migration content, MCP tool behavior, dashboard UI, and deployment blueprint.

- [ ] **Step 1: Run the complete repository checks.**

Run:

```powershell
Set-Location E:\FitLog\fitlog-plugin\plugins\fitlog-ai
npm test
npm run test:ts
npm run check
npm run build
python "C:\Users\LYL19\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py" .
git -C E:\FitLog\fitlog-plugin diff --check
```

Expected: every command exits 0 and `git diff --check` has no output.

- [ ] **Step 2: Run a local cloud-mode fail-closed check.**

Run without secrets:

```powershell
$env:NODE_ENV='production'; $env:FITLOG_RUNTIME='cloud'; npm run start
```

Expected: process exits before opening a port with an error naming the missing required configuration key but never printing secret values.

- [ ] **Step 3: Commit any verification-only fixes and push the branch.**

If a check exposed a defect, first run `git status --short`, then stage each exact source or test file changed to fix that defect. Use this commit command only when at least one such file is staged:

```powershell
git commit -m "fix: complete FitLog cloud runtime verification"
git push github fitlog-chatgpt-plugin
```

If no fixes are needed, do not create an empty commit; push the existing task commits.

- [ ] **Step 4: Hand off the exact external setup sequence.**

Ask the user to perform these browser actions in order: apply `002` SQL migration; enable OAuth 2.1 Server and dynamic registration; set Site URL and Authorization Path; create the Render service from the pushed branch; paste only the listed Render environment values directly into Render; then connect the Render `/mcp` URL in ChatGPT and approve OAuth. Do not ask the user to paste passwords, database connection strings, tokens, or private keys into chat.

## Plan Self-Review

- **Spec coverage:** Task 1 preserves local mode; Task 2 provides token-scoped Supabase persistence, RLS, and atomic workouts; Task 3 supplies resource metadata and request authentication; Task 4 removes captured owner identity from tools; Task 5 supplies the magic-link consent page and cloud bootstrap; Task 6 supplies Render configuration; Task 7 validates and hands off the external steps.
- **Scope:** Food photos, speech-to-text, usage-meter data, Apple Health, and public multi-user sharing remain intentionally excluded from this cloud-runtime plan.
- **Type consistency:** `OwnerContext`, `RepositoryFactory`, and async `FitLogRepository` are introduced before every later task that consumes them. Tool callbacks receive the owner through `AuthInfo.extra.owner`; repositories use that same owner for every call.
- **Completeness scan:** Each task names its source files, test files, red command, green command, and commit; no task delegates an unspecified implementation step.
