import { Prisma } from "@prisma/client";

export function isWriteConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

/** True when `error` is a unique-constraint (P2002) violation on the `idempotencyKey` column. */
export function isIdempotencyKeyConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  return Array.isArray(target) && target.includes("idempotencyKey");
}

/**
 * Runs a Serializable-transaction attempt and retries it when Postgres reports a serialization
 * failure / write conflict (Prisma P2034). Any other error — including a unique-constraint race
 * (P2002) a caller wants to handle itself — is rethrown immediately, and so is the P2034 from the
 * final attempt.
 *
 * `attempt` must re-read everything it validates against INSIDE its own `$transaction`; a snapshot
 * read before the transaction can't be protected by Serializable isolation.
 */
export async function retryOnWriteConflict<T>(attempt: () => Promise<T>, maxAttempts = 5): Promise<T> {
  for (let n = 1; ; n++) {
    try {
      return await attempt();
    } catch (error) {
      if (isWriteConflict(error) && n < maxAttempts) continue;
      throw error;
    }
  }
}
