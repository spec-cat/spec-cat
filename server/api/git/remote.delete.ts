import { isGitRepositorySync, deleteRemote } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

/**
 * DELETE /api/git/remote
 * Removes a remote from the repository.
 */
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      workingDirectory?: string;
      name: string;
    }>(event);
    const workingDirectory = body.workingDirectory || getProjectDir();

    if (!body.name) {
      throw createError({
        statusCode: 400,
        statusMessage: "name is required",
      });
    }

    if (!isGitRepositorySync(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
      });
    }

    try {
      deleteRemote(workingDirectory, body.name);
    } catch (gitError) {
      const errorMessage =
        gitError instanceof Error ? gitError.message : "Unknown error";
      throw createError({
        statusCode: 500,
        statusMessage: `Failed to delete remote: ${errorMessage}`,
      });
    }

    logger.api.info("Git remote deleted", { name: body.name });

    return { success: true };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error deleting git remote", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to delete remote",
    });
  }
});
