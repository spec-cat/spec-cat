import { pullBranch } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromBody, handleGitApiError } from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event) => {
  try {
    const { workingDirectory, body } = await resolveWorkingDirectoryFromBody(event);
    const typedBody = body as {
      branch?: string;
      remote?: string;
      noFastForward?: boolean;
      squash?: boolean;
    };

    try {
      pullBranch(workingDirectory, {
        branch: typedBody.branch,
        remote: typedBody.remote,
        noFastForward: typedBody.noFastForward,
        squash: typedBody.squash,
      });
    } catch (gitError) {
      const errorMessage =
        gitError instanceof Error ? gitError.message : "Unknown error";

      if (
        errorMessage.includes("CONFLICT") ||
        errorMessage.includes("merge conflict") ||
        errorMessage.includes("Automatic merge failed")
      ) {
        throw createError({
          statusCode: 409,
          statusMessage: `Pull conflict: ${errorMessage}`,
        });
      }

      if (errorMessage.includes("does not appear to be a git repository")) {
        throw createError({
          statusCode: 404,
          statusMessage: `Remote not found`,
        });
      }

      throw createError({
        statusCode: 500,
        statusMessage: `Git pull failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git pull successful", {
      branch: typedBody.branch,
      remote: typedBody.remote,
      noFastForward: typedBody.noFastForward,
      squash: typedBody.squash,
    });

    return { success: true };
  } catch (error) {
    handleGitApiError(error, "Error during git pull", "Failed to pull branch");
  }
});
