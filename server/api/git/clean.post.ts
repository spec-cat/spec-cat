import type { CleanUntrackedRequest, GitOperationResponse } from "~/types/git";
import { cleanUntrackedFiles, isGitRepository } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

export default defineEventHandler(async (event): Promise<GitOperationResponse> => {
  try {
    const body = await readBody<CleanUntrackedRequest>(event);
    const workingDirectory = body.workingDirectory || getProjectDir();

    if (!(await isGitRepository(workingDirectory))) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
        data: { code: "NOT_GIT_REPO" },
      });
    }

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
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error during git clean", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to clean untracked files",
    });
  }
});
