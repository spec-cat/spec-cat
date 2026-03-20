import { createStash } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromBody, handleGitApiError } from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event) => {
  try {
    const { workingDirectory, body } = await resolveWorkingDirectoryFromBody(event);

    try {
      createStash(workingDirectory, {
        message: body.message as string | undefined,
        includeUntracked: body.includeUntracked as boolean | undefined,
      });
    } catch (gitError) {
      const errorMessage = gitError instanceof Error ? gitError.message : "Unknown error";
      throw createError({
        statusCode: 500,
        statusMessage: `Stash creation failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git stash created", {
      message: body.message,
      includeUntracked: body.includeUntracked,
    });

    return { success: true };
  } catch (error) {
    handleGitApiError(error, "Error creating stash", "Failed to create stash");
  }
});
