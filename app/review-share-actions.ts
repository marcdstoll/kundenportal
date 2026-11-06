"use server";

import { requireUser } from "@/lib/session";
import { backfillReviewShares } from "@/lib/review-shares";

// Einstellungen: Review-Links bestehender Projekte durch Share-Links ersetzen (eine Portion pro Aufruf)
export async function runReviewShareBatch(retryFailed: boolean) {
  await requireUser("admin");
  return backfillReviewShares(undefined, retryFailed);
}
