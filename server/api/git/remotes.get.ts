import { listRemotes } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromQuery, handleGitApiError } from "~/server/utils/gitApiHelpers";

/**
 * GET /api/git/remotes
 * Returns a list of configured remotes for the repository.
 */
export default defineEventHandler(async (event) => {
  try {
    const workingDirectory = resolveWorkingDirectoryFromQuery(event);

    try {
      const remotes = listRemotes(workingDirectory);
      return { remotes };
    } catch (gitError) {
      const errorMessage =
        gitError instanceof Error ? gitError.message : "Unknown error";
      throw createError({
        statusCode: 500,
        statusMessage: `Failed to list remotes: ${errorMessage}`,
      });
    }
  } catch (error) {
    handleGitApiError(error, "Error listing git remotes", "Failed to list remotes");
  }
});
