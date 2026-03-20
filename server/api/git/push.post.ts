import { pushBranch } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromBody, handleGitApiError } from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event) => {
  try {
    const { workingDirectory, body } = await resolveWorkingDirectoryFromBody(event);
    const typedBody = body as {
      branch: string;
      remote?: string;
      force?: boolean;
      forceWithLease?: boolean;
    };

    if (!typedBody.branch) {
      throw createError({
        statusCode: 400,
        statusMessage: "branch is required",
      });
    }

    try {
      pushBranch(workingDirectory, typedBody.branch, {
        remote: typedBody.remote,
        force: typedBody.force,
        forceWithLease: typedBody.forceWithLease,
      });
    } catch (gitError) {
      const errorMessage =
        gitError instanceof Error ? gitError.message : "Unknown error";

      if (
        errorMessage.includes("rejected") ||
        errorMessage.includes("non-fast-forward")
      ) {
        throw createError({
          statusCode: 409,
          statusMessage: `Push rejected: ${errorMessage}`,
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
        statusMessage: `Git push failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git push successful", {
      branch: typedBody.branch,
      remote: typedBody.remote || "origin",
      force: typedBody.force,
      forceWithLease: typedBody.forceWithLease,
    });

    return { success: true };
  } catch (error) {
    handleGitApiError(error, "Error during git push", "Failed to push branch");
  }
});
