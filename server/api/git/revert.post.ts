import { revertCommit } from "~/server/utils/gitBranchOperations";
import { logger } from "~/server/utils/logger";
import {
  resolveWorkingDirectoryFromBody,
  handleGitApiError,
} from "~/server/utils/gitApiHelpers";

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
      revertCommit(workingDirectory, body.hash as string);
    } catch (gitError) {
      const errorMessage = gitError instanceof Error ? gitError.message : "Unknown error";

      if (errorMessage.includes("conflict") || errorMessage.includes("CONFLICT")) {
        throw createError({
          statusCode: 409,
          statusMessage: `Revert conflict: ${errorMessage}`,
        });
      }

      throw createError({
        statusCode: 500,
        statusMessage: `Revert failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git revert successful", { hash: body.hash });

    return { success: true };
  } catch (error) {
    handleGitApiError(error, "Error during git revert", "Failed to revert commit");
  }
});
