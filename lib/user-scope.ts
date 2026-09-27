/**
 * PostgREST filter restricting a `meter_logs` query to the caller's own rows.
 *
 * - Signed in  -> own rows PLUS shared demo rows (`user_id is null`).
 * - Anonymous  -> shared demo rows only, so an unauthenticated visitor never
 *                 sees (or accidentally writes) another account's data.
 *
 * Lives outside `app/actions/meter.ts` because a `"use server"` module may
 * only export async functions.
 */
export function buildUserScopeFilter(userId: string | null): string | null {
  return userId
    ? `user_id.eq.${userId},user_id.is.null`
    : "user_id.is.null";
}

/**
 * Picks the row set used for the history timeline.
 *
 * Scoped queries return own rows PLUS shared demo rows (`user_id is null`).
 * Mixing both in one chain would compute bogus deltas across the ownership
 * boundary (e.g. a user's own 4580 measured against a demo 4550). So: if the
 * caller owns any rows, use ONLY those; otherwise fall back to the shared set.
 */
export function selectOwnedRows<T extends { user_id?: string | null }>(
  logs: T[],
  userId: string | null,
): T[] {
  if (!userId) return logs;
  const own = logs.filter((log) => log.user_id === userId);
  return own.length > 0 ? own : logs;
}
