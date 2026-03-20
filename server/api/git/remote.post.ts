import { addRemote } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromBody, handleGitApiError } from "~/server/utils/gitApiHelpers";

/**
 * POST /api/git/remote
 * Adds a new remote to the repository.
 */
export default defineEventHandler(async (event) => {
  try {
    const { workingDirectory, body } = await resolveWorkingDirectoryFromBody(event);
    const typedBody = body as { name: string; url: string };

    if (!typedBody.name) {
      throw createError({
        statusCode: 400,
        statusMessage: "name is required",
      });
    }

    if (!typedBody.url) {
      throw createError({
        statusCode: 400,
        statusMessage: "url is required",
      });
    }

    try {
      addRemote(workingDirectory, typedBody.name, typedBody.url);
    } catch (gitError) {
      const errorMessage =
        gitError instanceof Error ? gitError.message : "Unknown error";
      throw createError({
        statusCode: 500,
        statusMessage: `Failed to add remote: ${errorMessage}`,
      });
    }

    logger.api.info("Git remote added", { name: typedBody.name, url: typedBody.url });

    return { success: true };
  } catch (error) {
    handleGitApiError(error, "Error adding git remote", "Failed to add remote");
  }
});
