import { fetchBranch } from "~/server/utils/gitBranchOperations";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromBody, handleGitApiError } from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event) => {
  try {
    const { workingDirectory, body } = await resolveWorkingDirectoryFromBody(event);

    try {
      fetchBranch(workingDirectory, {
        branch: body.branch as string | undefined,
        remote: body.remote as string | undefined,
        force: body.force as boolean | undefined,
        all: body.all as boolean | undefined,
        prune: body.prune as boolean | undefined,
        pruneTags: body.pruneTags as boolean | undefined,
      });
    } catch (gitError) {
      const errorMessage =
        gitError instanceof Error ? gitError.message : "Unknown error";

      if (errorMessage.includes("does not appear to be a git repository")) {
        throw createError({
          statusCode: 404,
          statusMessage: `Remote not found`,
        });
      }

      throw createError({
        statusCode: 500,
        statusMessage: `Git fetch failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git fetch successful", {
      branch: body.branch as string | undefined,
      remote: body.remote as string | undefined,
      all: body.all as boolean | undefined,
      prune: body.prune as boolean | undefined,
    });

    return { success: true };
  } catch (error) {
    handleGitApiError(error, "Error during git fetch", "Failed to fetch");
  }
});
