import { isGitRepository, pullBranch } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      workingDirectory?: string;
      branch?: string;
      remote?: string;
      noFastForward?: boolean;
      squash?: boolean;
    }>(event);
    const workingDirectory = body.workingDirectory || getProjectDir();

    if (!isGitRepository(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
      });
    }

    try {
      pullBranch(workingDirectory, {
        branch: body.branch,
        remote: body.remote,
        noFastForward: body.noFastForward,
        squash: body.squash,
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
      branch: body.branch,
      remote: body.remote,
      noFastForward: body.noFastForward,
      squash: body.squash,
    });

    return { success: true };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error during git pull", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to pull branch",
    });
  }
});
