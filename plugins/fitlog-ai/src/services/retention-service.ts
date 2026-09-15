import type { FitLogRepository, OwnerContext } from "../storage/repository.ts";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;

export async function runRetention(repository: FitLogRepository, owner: OwnerContext, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - THIRTY_DAYS_MS).toISOString();
  return repository.purgeAuditEventsBefore(owner, cutoff);
}
