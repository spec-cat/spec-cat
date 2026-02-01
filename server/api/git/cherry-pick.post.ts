import { isGitRepository, cherryPick } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      workingDirectory?: string;
      hash: string;
      recordOrigin?: boolean;
      noCommit?: boolean;
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
      cherryPick(workingDirectory, body.hash, {
        recordOrigin: body.recordOrigin,
        noCommit: body.noCommit,
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

    logger.api.info("Git cherry-pick successful", { hash: body.hash });

    return { success: true };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error during git cherry-pick", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to cherry-pick commit",
    });
  }
});
