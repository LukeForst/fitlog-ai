import type { FitLogRepository } from "../storage/repository.ts";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;

export function runRetention(repository: FitLogRepository, now: Date, ownerEmail = "me@example.com"): number {
  const cutoff = new Date(now.getTime() - THIRTY_DAYS_MS).toISOString();
  return repository.purgeAuditEventsBefore(ownerEmail, cutoff);
}
