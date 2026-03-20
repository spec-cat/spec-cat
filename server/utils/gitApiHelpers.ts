import type { H3Event } from "h3";
import { isGitRepositorySync, isGitRepository } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

/**
 * Resolve working directory from GET query parameters and validate it's a git repo.
 * Throws appropriate H3 errors on failure.
 */
export function resolveWorkingDirectoryFromQuery(event: H3Event): string {
  const query = getQuery(event);
  const workingDirectory = query.workingDirectory as string | undefined;

  if (!workingDirectory) {
    throw createError({
      statusCode: 400,
      statusMessage: "workingDirectory query parameter is required",
    });
  }

  assertGitRepo(workingDirectory);
  return workingDirectory;
}

/**
 * Resolve working directory from POST body and validate it's a git repo.
 * Falls back to the configured project directory if not provided.
 */
export async function resolveWorkingDirectoryFromBody(event: H3Event): Promise<{ workingDirectory: string; body: Record<string, unknown> }> {
  const body = await readBody(event);
  const workingDirectory = (body?.workingDirectory as string) || getProjectDir();

  assertGitRepo(workingDirectory);
  return { workingDirectory, body: body ?? {} };
}

/**
 * Synchronously assert that a directory is a git repository.
 * Throws a 400 error if not.
 */
export function assertGitRepo(cwd: string): void {
  if (!isGitRepositorySync(cwd)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Not a Git repository",
      data: { code: "NOT_GIT_REPO" },
    });
  }
}

/**
 * Async version of assertGitRepo for endpoints using the async check.
 */
export async function assertGitRepoAsync(cwd: string): Promise<void> {
  if (!(await isGitRepository(cwd))) {
    throw createError({
      statusCode: 400,
      statusMessage: "Not a Git repository",
      data: { code: "NOT_GIT_REPO" },
    });
  }
}

/**
 * Standard error handler for git API endpoints.
 * Re-throws H3 errors, wraps unknown errors with a 500 status.
 */
export function handleGitApiError(error: unknown, context: string, fallbackMessage: string): never {
  if (error && typeof error === "object" && "statusCode" in error) {
    throw error;
  }

  logger.api.error(context, { error });
  throw createError({
    statusCode: 500,
    statusMessage: fallbackMessage,
  });
}
