import { mergeBranch } from "~/server/utils/gitBranchOperations";
import { logger } from "~/server/utils/logger";
import {
  resolveWorkingDirectoryFromBody,
  handleGitApiError,
} from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event) => {
  try {
    const { workingDirectory, body } = await resolveWorkingDirectoryFromBody(event);

    if (!body.branch) {
      throw createError({
        statusCode: 400,
        statusMessage: "branch is required",
      });
    }

    try {
      mergeBranch(workingDirectory, body.branch as string, {
        noCommit: body.noCommit as boolean | undefined,
        noFastForward: body.noFastForward as boolean | undefined,
        squash: body.squash as boolean | undefined,
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
          statusMessage: `Merge conflict: ${errorMessage}`,
        });
      }

      if (errorMessage.includes("not something we can merge")) {
        throw createError({
          statusCode: 404,
          statusMessage: `Branch '${body.branch}' not found`,
        });
      }

      throw createError({
        statusCode: 500,
        statusMessage: `Git merge failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git merge successful", {
      branch: body.branch,
      noCommit: body.noCommit,
      noFastForward: body.noFastForward,
      squash: body.squash,
    });

    return { success: true };
  } catch (error) {
    handleGitApiError(error, "Error during git merge", "Failed to merge branch");
  }
});
