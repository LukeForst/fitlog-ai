import { z } from "zod";
import { AuthorizationError } from "../auth/identity.ts";
import { createDashboardService } from "../services/dashboard-service.ts";
import { createRecordService } from "../services/record-service.ts";
import type { OwnerContext, RepositoryFactory } from "../storage/repository.ts";

const setSchema = z.object({ weightKg: z.number(), reps: z.number().int() });
const workoutSchema = { date: z.string(), title: z.string(), note: z.string().optional(), exercises: z.array(z.object({ name: z.string(), sets: z.array(setSchema) })) };
const mealSchema = { date: z.string(), mealType: z.string(), note: z.string().optional(), calories: z.number(), proteinG: z.number(), carbsG: z.number(), fatG: z.number() };
const dashboardMeta = { "ui/resourceUri": "ui://fitlog/dashboard", ui: { resourceUri: "ui://fitlog/dashboard" } };

type ToolExtra = { authInfo?: { extra?: Record<string, unknown> } };
type ToolServer = { registerTool: Function };

export interface FitlogToolDependencies {
  repositoryFactory: RepositoryFactory;
  mode: "local" | "cloud";
  localOwner?: OwnerContext;
}

function isOwnerContext(value: unknown): value is OwnerContext {
  if (!value || typeof value !== "object") return false;
  const owner = value as Partial<OwnerContext>;
  return typeof owner.id === "string" && owner.id.length > 0 && typeof owner.email === "string" && owner.email.length > 0;
}

function ownerFromExtra(extra: ToolExtra | undefined, dependencies: FitlogToolDependencies): OwnerContext {
  if (dependencies.mode === "local") {
    if (!dependencies.localOwner) throw new Error("local owner is required");
    return dependencies.localOwner;
  }
  const owner = extra?.authInfo?.extra?.owner;
  if (!isOwnerContext(owner) || !owner.accessToken) throw new AuthorizationError(401, "authorization required");
  return owner;
}

function authorizationResult(error: unknown): { isError: true; content: Array<{ type: "text"; text: string }> } | undefined {
  if (!(error instanceof AuthorizationError)) return undefined;
  return { isError: true, content: [{ type: "text", text: "请先完成 FitLog 登录授权后再使用此功能。" }] };
}

export function registerFitlogTools(server: ToolServer, dependencies: FitlogToolDependencies): void {
  const resolve = (extra: ToolExtra | undefined) => {
    const owner = ownerFromExtra(extra, dependencies);
    return { owner, repository: dependencies.repositoryFactory.forOwner(owner) };
  };

  server.registerTool("log_workout", { title: "记录训练", description: "记录一次力量训练、动作和每组重量与次数。", inputSchema: workoutSchema }, async (input: z.infer<z.ZodObject<typeof workoutSchema>>, extra: ToolExtra) => {
    try {
      const { owner, repository } = resolve(extra);
      const result = await createRecordService(repository).recordWorkout(owner, input);
      return { content: [{ type: "text", text: `已记录「${result.workout.title}」，训练量 ${result.volumeKg} kg。` }], structuredContent: result };
    } catch (error) { return authorizationResult(error) ?? Promise.reject(error); }
  });

  server.registerTool("log_meal", { title: "记录饮食", description: "记录一餐的热量与三大营养素。", inputSchema: mealSchema }, async (input: z.infer<z.ZodObject<typeof mealSchema>>, extra: ToolExtra) => {
    try {
      const { owner, repository } = resolve(extra);
      const result = await createRecordService(repository).recordMeal(owner, input);
      return { content: [{ type: "text", text: `已记录${result.meal.mealType}，${result.nutrition.calories} 千卡。` }], structuredContent: result };
    } catch (error) { return authorizationResult(error) ?? Promise.reject(error); }
  });

  server.registerTool("record_body_measurement", { title: "记录身体数据", description: "记录体重和可选的体脂率。", inputSchema: { date: z.string(), weightKg: z.number(), bodyFatPercent: z.number().optional() } }, async (input: { date: string; weightKg: number; bodyFatPercent?: number }, extra: ToolExtra) => {
    try {
      const { owner, repository } = resolve(extra);
      const result = await createRecordService(repository).recordBodyMeasurement(owner, input);
      return { content: [{ type: "text", text: `已记录体重 ${result.measurement.weightKg} kg。` }], structuredContent: result };
    } catch (error) { return authorizationResult(error) ?? Promise.reject(error); }
  });

  server.registerTool("get_dashboard", { title: "查看健身仪表盘", description: "获取一个日期范围内的训练、饮食和身体数据摘要。", inputSchema: { from: z.string(), to: z.string(), exerciseName: z.string().optional() }, _meta: dashboardMeta }, async (input: { from: string; to: string; exerciseName?: string }, extra: ToolExtra) => {
    try {
      const { owner, repository } = resolve(extra);
      const result = await createDashboardService(repository).getDashboard(owner, { from: input.from, to: input.to }, input.exerciseName);
      return { content: [{ type: "text", text: `这段时间训练 ${result.trainingDays} 天，训练量 ${result.weeklyVolumeKg} kg，摄入 ${result.nutrition.calories} 千卡。` }], structuredContent: result, _meta: dashboardMeta };
    } catch (error) { return authorizationResult(error) ?? Promise.reject(error); }
  });

  server.registerTool("get_history", { title: "查看历史记录", description: "按日期范围获取训练、饮食或身体数据历史。", inputSchema: { from: z.string(), to: z.string(), kind: z.enum(["workouts", "meals", "measurements"]) } }, async (input: { from: string; to: string; kind: "workouts" | "meals" | "measurements" }, extra: ToolExtra) => {
    try {
      const { owner, repository } = resolve(extra);
      const items = input.kind === "workouts" ? await repository.listWorkouts(owner, input.from, input.to) : input.kind === "meals" ? await repository.listMeals(owner, input.from, input.to) : await repository.listMeasurements(owner, input.from, input.to);
      return { content: [{ type: "text", text: `已读取 ${items.length} 条${input.kind}记录。` }], structuredContent: { kind: input.kind, items } };
    } catch (error) { return authorizationResult(error) ?? Promise.reject(error); }
  });

  server.registerTool("remember_fact", { title: "保存长期记忆", description: "保存与健身相关、需要长期保留的个人偏好或事实。", inputSchema: { content: z.string(), category: z.string().optional(), isImportant: z.boolean() } }, async (input: { content: string; category?: string; isImportant: boolean }, extra: ToolExtra) => {
    try {
      const { owner, repository } = resolve(extra);
      const result = await createRecordService(repository).rememberFact(owner, input);
      return { content: [{ type: "text", text: "已保存长期健身记忆。" }], structuredContent: result };
    } catch (error) { return authorizationResult(error) ?? Promise.reject(error); }
  });

  server.registerTool("forget_fact", { title: "删除长期记忆", description: "删除一条已保存的长期健身记忆。", inputSchema: { memoryId: z.string().uuid() } }, async (input: { memoryId: string }, extra: ToolExtra) => {
    try {
      const { owner, repository } = resolve(extra);
      const deleted = await createRecordService(repository).forgetFact(owner, input.memoryId);
      return { content: [{ type: "text", text: deleted ? "已删除长期健身记忆。" : "没有找到要删除的长期健身记忆。" }], structuredContent: { deleted } };
    } catch (error) { return authorizationResult(error) ?? Promise.reject(error); }
  });
}
