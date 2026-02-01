import { isGitRepository, pushBranch } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      workingDirectory?: string;
      branch: string;
      remote?: string;
      force?: boolean;
      forceWithLease?: boolean;
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
      pushBranch(workingDirectory, body.branch, {
        remote: body.remote,
        force: body.force,
        forceWithLease: body.forceWithLease,
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
      branch: body.branch,
      remote: body.remote || "origin",
      force: body.force,
      forceWithLease: body.forceWithLease,
    });

    return { success: true };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error during git push", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to push branch",
    });
  }
});
