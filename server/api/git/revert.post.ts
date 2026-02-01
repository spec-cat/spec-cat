import { isGitRepository, revertCommit } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      workingDirectory?: string;
      hash: string;
    }>(event);
    const workingDirectory = body.workingDirectory || getProjectDir();

    if (!body.hash) {
      throw createError({
        statusCode: 400,
        statusMessage: "hash is required",
      });
    }

    if (!(await isGitRepository(workingDirectory))) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
      });
    }

    try {
      revertCommit(workingDirectory, body.hash);
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
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error during git revert", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to revert commit",
    });
  }
});
