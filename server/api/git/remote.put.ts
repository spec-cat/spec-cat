import { editRemote } from "~/server/utils/git";
import { resolveWorkingDirectoryFromBody, handleGitApiError } from "~/server/utils/gitApiHelpers";
import { logger } from "~/server/utils/logger";

/**
 * PUT /api/git/remote
 * Updates the URL of an existing remote.
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

    if (!body.newUrl) {
      throw createError({
        statusCode: 400,
        statusMessage: "newUrl is required",
      });
    }

    try {
      editRemote(workingDirectory, body.name as string, body.newUrl as string);
    } catch (gitError) {
      const errorMessage =
        gitError instanceof Error ? gitError.message : "Unknown error";
      throw createError({
        statusCode: 500,
        statusMessage: `Failed to edit remote: ${errorMessage}`,
      });
    }

    logger.api.info("Git remote updated", {
      name: body.name,
      newUrl: body.newUrl,
    });

    return { success: true };
  } catch (error) {
    handleGitApiError(error, "editing git remote", "Failed to edit remote");
  }
});
