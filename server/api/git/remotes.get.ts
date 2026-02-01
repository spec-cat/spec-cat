import { isGitRepositorySync, listRemotes } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

/**
 * GET /api/git/remotes
 * Returns a list of configured remotes for the repository.
 */
export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const workingDirectory = (query.workingDirectory as string) || getProjectDir();

    if (!isGitRepositorySync(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
      });
    }

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
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error listing git remotes", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to list remotes",
    });
  }
});
