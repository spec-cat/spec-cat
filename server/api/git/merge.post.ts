import { isGitRepository, mergeBranch } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      workingDirectory?: string;
      branch: string;
      noCommit?: boolean;
      noFastForward?: boolean;
      squash?: boolean;
    }>(event);
    const workingDirectory = body.workingDirectory || getProjectDir();

    if (!body.branch) {
      throw createError({
        statusCode: 400,
        statusMessage: "branch is required",
      });
    }

    if (!isGitRepository(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
      });
    }

    try {
      mergeBranch(workingDirectory, body.branch, {
        noCommit: body.noCommit,
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
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error during git merge", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to merge branch",
    });
  }
});
