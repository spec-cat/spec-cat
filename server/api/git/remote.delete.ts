import { deleteRemote } from "~/server/utils/git";
import { resolveWorkingDirectoryFromBody, handleGitApiError } from "~/server/utils/gitApiHelpers";
import { logger } from "~/server/utils/logger";

/**
 * DELETE /api/git/remote
 * Removes a remote from the repository.
 */
export default defineEventHandler(async (event) => {
  try {
    const { workingDirectory, body } = await resolveWorkingDirectoryFromBody(event);

    if (!body.name) {
      throw createError({
        statusCode: 400,
        statusMessage: "name is required",
      });
    }

    try {
      deleteRemote(workingDirectory, body.name as string);
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
    handleGitApiError(error, "deleting git remote", "Failed to delete remote");
  }
});
