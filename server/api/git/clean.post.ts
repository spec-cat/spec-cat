import type { CleanUntrackedRequest, GitOperationResponse } from "~/types/git";
import { cleanUntrackedFiles } from "~/server/utils/gitBranchOperations";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromBody, handleGitApiError } from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event): Promise<GitOperationResponse> => {
  try {
    const { workingDirectory } = await resolveWorkingDirectoryFromBody(event);

    try {
      cleanUntrackedFiles(workingDirectory);
    } catch (gitError) {
      const errorMessage = gitError instanceof Error ? gitError.message : "Unknown error";
      throw createError({
        statusCode: 500,
        statusMessage: `Git clean failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git clean successful", { workingDirectory });

    return { success: true };
  } catch (error) {
    handleGitApiError(error, "Error during git clean", "Failed to clean untracked files");
  }
});
