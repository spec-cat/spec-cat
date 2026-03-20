import { cherryPick } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromBody, handleGitApiError } from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event) => {
  try {
    const { workingDirectory, body } = await resolveWorkingDirectoryFromBody(event);

    if (!body.hash) {
      throw createError({
        statusCode: 400,
        statusMessage: "hash is required",
      });
    }

    try {
      cherryPick(workingDirectory, body.hash as string, {
        recordOrigin: body.recordOrigin as boolean | undefined,
        noCommit: body.noCommit as boolean | undefined,
      });
    } catch (gitError) {
      const errorMessage = gitError instanceof Error ? gitError.message : "Unknown error";

      if (errorMessage.includes("conflict") || errorMessage.includes("CONFLICT")) {
        throw createError({
          statusCode: 409,
          statusMessage: `Cherry-pick conflict: ${errorMessage}`,
        });
      }

      throw createError({
        statusCode: 500,
        statusMessage: `Cherry-pick failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git cherry-pick successful", { hash: body.hash as string });

    return { success: true };
  } catch (error) {
    handleGitApiError(error, "Error during git cherry-pick", "Failed to cherry-pick commit");
  }
});
