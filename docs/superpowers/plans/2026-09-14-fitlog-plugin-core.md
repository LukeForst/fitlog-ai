# FitLog 私有插件核心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Build a locally runnable, single-user MCP fitness plugin core that records structured workouts and meals, persists them in SQLite, and returns a ChatGPT-compatible dashboard UI resource.

**Architecture:** The existing static demo remains untouched. A new plugins/fitlog-ai TypeScript package separates domain validation, SQLite persistence, service logic, MCP tool registration, and an MCP Apps dashboard. The package uses one fixed local owner identity in developer mode; the production cloud, OAuth, and object-storage work stays in a separately scoped deployment plan because it requires user-owned accounts and credentials.

**Tech Stack:** Node.js 24, TypeScript strict mode, node:test, @modelcontextprotocol/sdk, zod, node:sqlite, Vite, vanilla TypeScript, CSS.

**Spec:** docs/superpowers/specs/2026-09-14-fitlog-chatgpt-plugin-design.md

## Global Constraints

- Keep dist/ intact; create all plugin files under plugins/fitlog-ai/.
- The core has one owner and never accepts a caller-provided user ID.
- Weight uses kg; reps are positive integers; calories and macro grams are non-negative.
- A successful write tool response means its main record is already committed.
- Never persist prompts, ChatGPT transcripts, access tokens, API keys, or database URLs in business records.
- Every UI-enabled tool also returns structured content the model can use without the UI.
- Every behavior starts with a focused failing test.

## File Structure

    plugins/fitlog-ai/
      .codex-plugin/plugin.json
      .mcp.json
      package.json
      tsconfig.json
      vite.config.ts
      src/domain/{types,validation,calculations}.ts
      src/storage/{repository,sqlite-repository}.ts
      src/services/{record-service,dashboard-service,retention-service}.ts
      src/mcp/{tools,server}.ts
      src/ui/{dashboard-model,dashboard,dashboard.css,index.html}
      src/index.ts
      tests/{package,domain,sqlite-repository,record-service,dashboard-service,mcp-tools,dashboard-model,retention-service}.test.ts

### Task 1: Scaffold the isolated plugin package

**Files:**
- Create: plugins/fitlog-ai/.codex-plugin/plugin.json
- Create: plugins/fitlog-ai/.mcp.json
- Create: plugins/fitlog-ai/package.json
- Create: plugins/fitlog-ai/tsconfig.json
- Create: plugins/fitlog-ai/tests/package.test.mjs

**Interfaces:**
- Produces npm test, npm run check, npm run build, and npm run start.
- Produces plugin name fitlog-ai and developer endpoint http://127.0.0.1:3333/mcp.

- [ ] **Step 1: Create the plugin folders and manifest.**

Run from the plugin-creator skill directory:

    python scripts/create_basic_plugin.py fitlog-ai --path "C:/Users/LYL19/Documents/Codex/2026-09-14/xia/work/fitlog-demo/plugins" --with-mcp --with-apps --with-skills

- [ ] **Step 2: Write the failing metadata test.**

Create tests/package.test.mjs:

    import test from 'node:test';
    import assert from 'node:assert/strict';
    import { readFile } from 'node:fs/promises';

    test('declares FitLog and its local MCP endpoint', async () => {
      const manifest = JSON.parse(await readFile('.codex-plugin/plugin.json', 'utf8'));
      const mcp = JSON.parse(await readFile('.mcp.json', 'utf8'));
      assert.equal(manifest.name, 'fitlog-ai');
      assert.equal(mcp.mcpServers.fitlog.url, 'http://127.0.0.1:3333/mcp');
    });

- [ ] **Step 3: Verify red.**

Run: node --test tests/package.test.mjs

Expected: failure because the test command or fitlog MCP declaration is missing.

- [ ] **Step 4: Add minimal configuration.**

Set scripts to npm test = node --test tests/*.test.mjs, npm run test:ts = tsx --test tests/*.test.ts, npm run check = tsc --noEmit, npm run build = vite build, and npm run start = tsx src/index.ts. Set .mcp.json with one HTTP server named fitlog at the endpoint above. Set the manifest name to fitlog-ai with a Chinese description and reference .mcp.json. Do not create a marketplace entry.

- [ ] **Step 5: Verify green and commit.**

Run:

    node --test tests/package.test.mjs
    npm run check
    python "C:/Users/LYL19/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py" .
    git add plugins/fitlog-ai
    git commit -m "feat: scaffold FitLog private plugin"

Expected: all three checks exit 0.

### Task 2: Add validated domain records and calculations

**Files:**
- Create: plugins/fitlog-ai/src/domain/types.ts
- Create: plugins/fitlog-ai/src/domain/validation.ts
- Create: plugins/fitlog-ai/src/domain/calculations.ts
- Create: plugins/fitlog-ai/tests/domain.test.ts

**Interfaces:**
- Produces parseWorkoutInput(input), parseMealInput(input), calculateWorkoutVolume(exercises), and sumNutrition(meals).
- Exports WorkoutInput, ExerciseInput, SetInput, MealInput, and NutritionTotals.

- [ ] **Step 1: Write failing tests.**

Create tests/domain.test.ts:

    test('calculates volume from normalized workout sets', () => {
      const workout = parseWorkoutInput({
        date: '2026-09-14', title: '下肢力量',
        exercises: [{ name: '深蹲', sets: [{ weightKg: 80, reps: 5 }, { weightKg: 80, reps: 5 }]}]
      });
      assert.equal(calculateWorkoutVolume(workout.exercises), 800);
    });

    test('rejects a set with zero repetitions', () => {
      assert.throws(() => parseWorkoutInput({
        date: '2026-09-14', title: '错误',
        exercises: [{ name: '深蹲', sets: [{ weightKg: 80, reps: 0 }]}]
      }));
    });

    test('accepts non-negative meal nutrients', () => {
      const meal = parseMealInput({
        date: '2026-09-14', mealType: '午餐', note: '鸡胸肉饭',
        calories: 460, proteinG: 35, carbsG: 58, fatG: 12
      });
      assert.equal(meal.calories, 460);
    });

- [ ] **Step 2: Verify red.**

Run: npm run test:one -- tests/domain.test.ts

Expected: module-not-found failure for the domain module.

- [ ] **Step 3: Implement the minimum domain functions.**

Use zod for ISO date, non-empty title/action name, weightKg >= 0, integer reps >= 1, and non-negative calories/macros. Define volume as the sum of weightKg * reps across all sets. Keep error messages safe to return in a tool error.

- [ ] **Step 4: Verify green and commit.**

Run:

    npm run test:one -- tests/domain.test.ts
    npm run check
    git add plugins/fitlog-ai/src/domain plugins/fitlog-ai/tests/domain.test.ts plugins/fitlog-ai/package.json
    git commit -m "feat: validate FitLog training and meal data"

Expected: three domain tests pass and TypeScript exits 0.

### Task 3: Persist records and enforce single-owner access

**Files:**
- Create: plugins/fitlog-ai/src/storage/repository.ts
- Create: plugins/fitlog-ai/src/storage/sqlite-repository.ts
- Create: plugins/fitlog-ai/tests/sqlite-repository.test.ts

**Interfaces:**
- Produces createSqliteRepository(path, ownerEmail).
- Exposes saveWorkout, saveMeal, saveBodyMeasurement, saveMemoryFact, listWorkouts, listMeals, listMeasurements, listMemoryFacts, and deleteMemoryFact.
- Every method takes the resolved owner email and throws Error('not authorized') for another email.

- [ ] **Step 1: Write failing persistence tests.**

Create tests/sqlite-repository.test.ts:

    test('stores and reloads a workout for the configured owner', () => {
      const repo = createSqliteRepository(':memory:', 'me@example.com');
      const id = repo.saveWorkout('me@example.com', workoutInput);
      assert.equal(repo.listWorkouts('me@example.com', '2026-09-14', '2026-09-14')[0].id, id);
    });

    test('rejects a different email', () => {
      const repo = createSqliteRepository(':memory:', 'me@example.com');
      assert.throws(
        () => repo.listWorkouts('other@example.com', '2026-09-14', '2026-09-14'),
        /not authorized/
      );
    });

- [ ] **Step 2: Verify red.**

Run: npm run test:one -- tests/sqlite-repository.test.ts

Expected: module-not-found failure for sqlite-repository.

- [ ] **Step 3: Implement the repository.**

Use Node's built-in node:sqlite module with foreign keys on. Initialize users, workouts, exercises, workout_sets, meals, body_measurements, memory_facts, and audit_events in one transaction. Resolve the configured owner at startup. Bind all queries to this owner ID after checking the owner email; never accept user ID as a model or tool parameter.

- [ ] **Step 4: Verify green and commit.**

Run:

    npm run test:one -- tests/sqlite-repository.test.ts
    npm test
    npm run check
    git add plugins/fitlog-ai/src/storage plugins/fitlog-ai/tests/sqlite-repository.test.ts plugins/fitlog-ai/package.json
    git commit -m "feat: persist FitLog records for one owner"

Expected: round-trip and isolation tests pass with all earlier tests.

### Task 4: Create record and dashboard services

**Files:**
- Create: plugins/fitlog-ai/src/services/record-service.ts
- Create: plugins/fitlog-ai/src/services/dashboard-service.ts
- Create: plugins/fitlog-ai/tests/record-service.test.ts
- Create: plugins/fitlog-ai/tests/dashboard-service.test.ts

**Interfaces:**
- Produces recordWorkout(ownerEmail, input), recordMeal(ownerEmail, input), recordBodyMeasurement(ownerEmail, input), rememberFact(ownerEmail, input), forgetFact(ownerEmail, memoryId), and getDashboard(ownerEmail, range, exerciseName?).
- getDashboard returns range, nutrition, trainingDays, streakDays, weeklyVolumeKg, exerciseTrend, and recentWorkouts.

- [ ] **Step 1: Write failing write-service tests.**

Using a real in-memory SQLite repository, assert recordWorkout returns its saved ID and volumeKg 800, recordMeal returns stored macro totals, and rememberFact rejects blank content.

- [ ] **Step 2: Verify red.**

Run: npm run test:one -- tests/record-service.test.ts

Expected: missing export failure for record-service.

- [ ] **Step 3: Implement write services.**

Parse inputs through Task 2, persist them through Task 3, then append one audit event containing only event type, timestamp, and record ID. forgetFact may delete only an owner-owned fact. Never store prompt text or model output.

- [ ] **Step 4: Write, run red, then implement dashboard aggregation.**

Create dashboard-service.test.ts with two workout days, one meal, and one measurement. Assert that a seven-day dashboard has trainingDays 2, correct nutrition sum, correct weekly volume, and chronological values for an exercise trend. First run must fail because dashboard-service is missing; then aggregate using repository queries.

- [ ] **Step 5: Verify green and commit.**

Run:

    npm run test:one -- tests/record-service.test.ts
    npm run test:one -- tests/dashboard-service.test.ts
    npm test
    npm run check
    git add plugins/fitlog-ai/src/services plugins/fitlog-ai/tests/record-service.test.ts plugins/fitlog-ai/tests/dashboard-service.test.ts
    git commit -m "feat: add FitLog records and dashboard summaries"

Expected: focused tests and complete suite pass.

### Task 5: Register MCP tools and structured ChatGPT results

**Files:**
- Create: plugins/fitlog-ai/src/mcp/tools.ts
- Create: plugins/fitlog-ai/src/mcp/server.ts
- Create: plugins/fitlog-ai/tests/mcp-tools.test.ts

**Interfaces:**
- Produces createFitlogServer({ ownerEmail, repository }).
- Registers log_workout, log_meal, record_body_measurement, get_dashboard, get_history, remember_fact, and forget_fact.
- Dashboard results include _meta.ui.resourceUri = ui://fitlog/dashboard and structuredContent.

- [ ] **Step 1: Write failing MCP tests.**

Instantiate the real server with me@example.com and in-memory SQLite. Invoke log_workout with a deep-squat payload, then get_dashboard. Assert the first result has structuredContent.volumeKg equal to 800. Assert the dashboard has structuredContent.trainingDays equal to 1 and the stated resource URI.

- [ ] **Step 2: Verify red.**

Run: npm run test:one -- tests/mcp-tools.test.ts

Expected: createFitlogServer missing-export failure.

- [ ] **Step 3: Implement MCP handlers.**

Use explicit zod tool schemas. Every handler passes the server-held owner email to Task 4 services. Tool schemas must omit email and user ID. Return short Chinese text plus structuredContent. Register a dashboard UI resource URI but keep all reads useful without the widget.

- [ ] **Step 4: Verify green and commit.**

Run:

    npm run test:one -- tests/mcp-tools.test.ts
    npm test
    npm run check
    git add plugins/fitlog-ai/src/mcp plugins/fitlog-ai/tests/mcp-tools.test.ts
    git commit -m "feat: expose FitLog records through MCP tools"

Expected: tool calls use persisted values and the whole suite passes.

### Task 6: Build the narrow-screen dashboard widget

**Files:**
- Create: plugins/fitlog-ai/src/ui/dashboard-model.ts
- Create: plugins/fitlog-ai/src/ui/dashboard.ts
- Create: plugins/fitlog-ai/src/ui/dashboard.css
- Create: plugins/fitlog-ai/src/ui/index.html
- Create: plugins/fitlog-ai/tests/dashboard-model.test.ts
- Modify: plugins/fitlog-ai/vite.config.ts
- Modify: plugins/fitlog-ai/src/mcp/server.ts

**Interfaces:**
- Produces toDashboardViewModel(dashboard), which returns cards for calories/macros, streak, weekly volume, recent workouts, and chronological exercise points.
- The widget consumes MCP Apps ui/initialize and ui/notifications/tool-result messages.

- [ ] **Step 1: Write the failing view-model test.**

Create tests/dashboard-model.test.ts:

    test('formats nutrition cards and chronological exercise points', () => {
      const view = toDashboardViewModel({
        nutrition: { calories: 580, proteinG: 59, carbsG: 61, fatG: 14 },
        trainingDays: 2, streakDays: 2, weeklyVolumeKg: 1200,
        exerciseTrend: [{ date: '2026-09-13', value: 75 }, { date: '2026-09-14', value: 80 }],
        recentWorkouts: [{ date: '2026-09-14', title: '下肢力量', volumeKg: 800 }]
      });
      assert.equal(view.cards[0].value, '580 kcal');
      assert.deepEqual(view.exercisePoints.map(point => point.value), [75, 80]);
    });

- [ ] **Step 2: Verify red.**

Run: npm run test:one -- tests/dashboard-model.test.ts

Expected: module-not-found failure for dashboard-model.

- [ ] **Step 3: Implement a pure model and browser renderer.**

Format labels in dashboard-model before any DOM operation. The renderer listens to the MCP Apps bridge, whitelists dashboard fields, and renders cards plus a simple SVG polyline using textContent. At widths below 640px use one column, visible keyboard focus, no external fonts, and no network requests. With no bridge payload, show 等待仪表盘数据.

- [ ] **Step 4: Attach the built resource and verify green.**

Configure Vite to emit one HTML widget. In server.ts register ui://fitlog/dashboard with MIME type text/html;profile=mcp-app. Run:

    npm run test:one -- tests/dashboard-model.test.ts
    npm test
    npm run check
    npm run build

Expected: all tests pass, TypeScript exits 0, and Vite produces the resource.

- [ ] **Step 5: Commit the widget.**

Run:

    git add plugins/fitlog-ai/src/ui plugins/fitlog-ai/src/mcp/server.ts plugins/fitlog-ai/tests/dashboard-model.test.ts plugins/fitlog-ai/vite.config.ts
    git commit -m "feat: add FitLog ChatGPT dashboard widget"

### Task 7: Add local startup and retention cleanup

**Files:**
- Create: plugins/fitlog-ai/src/services/retention-service.ts
- Create: plugins/fitlog-ai/src/index.ts
- Create: plugins/fitlog-ai/tests/retention-service.test.ts
- Create: plugins/fitlog-ai/README.md
- Modify: plugins/fitlog-ai/package.json

**Interfaces:**
- Produces runRetention(repository, now) and a local HTTP process exposing /mcp.
- runRetention deletes audit events older than 30 days and returns the number deleted.

- [ ] **Step 1: Write the failing retention test.**

Create a repository with one audit event from 2026-08-01 and one from 2026-09-13. Call runRetention(repo, new Date('2026-09-14T02:00:00Z')) and assert it deletes one event and retains one event.

- [ ] **Step 2: Verify red.**

Run: npm run test:one -- tests/retention-service.test.ts

Expected: module-not-found failure for retention-service.

- [ ] **Step 3: Implement cleanup and startup.**

Run cleanup in one repository transaction. Start an MCP-compatible HTTP transport at PORT or 3333. In developer mode default FITLOG_OWNER_EMAIL to me@example.com and FITLOG_SQLITE_PATH to ./fitlog.local.db; in production mode reject missing values. README must document local commands and these three prompts:

    记录今天深蹲 80 公斤 5 次做 3 组
    记录午餐：鸡胸肉饭，460 千卡，蛋白质 35 克
    查看最近 7 天仪表盘

- [ ] **Step 4: Run final core verification.**

Run:

    npm test
    npm run check
    npm run build
    python "C:/Users/LYL19/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py" .
    git diff --check

Expected: every test passes, TypeScript check exits 0, widget builds, validator exits 0, and diff check has no errors.

- [ ] **Step 5: Commit the runnable local core.**

Run:

    git add plugins/fitlog-ai
    git commit -m "feat: run FitLog private plugin core locally"

## Plan Self-Review

- Covered in this plan: structured training, meal, body, and explicit memory records; fixed owner isolation; immediate persistence; dashboard aggregation; narrow-screen MCP UI; and 30-day audit cleanup.
- Excluded because they require cloud credentials and form an independent deployment deliverable: stable HTTPS endpoint, OAuth 2.1 email login, PostgreSQL, private image storage, photo upload, and cloud scheduler.
- Interfaces are consistent: WorkoutInput, MealInput, NutritionTotals, createSqliteRepository, createFitlogServer, getDashboard, and toDashboardViewModel.
- The plan contains no incomplete task instructions: each task names its files, a failing test, a green verification command, and a commit.
