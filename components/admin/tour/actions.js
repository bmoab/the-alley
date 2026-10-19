"use server";
import { requireAdmin } from "@/lib/auth.js";

/**
 * The account tour's stand-in for every form's save: nothing is written. (The
 * preview stops submits before they get here; this is the backstop.)
 */
export async function tourNoop() {
  await requireAdmin();
  return { ok: true, tour: true };
}
