import { isGitRepository, fetchBranch } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      workingDirectory?: string;
      branch?: string;
      remote?: string;
      force?: boolean;
      all?: boolean;
      prune?: boolean;
      pruneTags?: boolean;
    }>(event);
    const workingDirectory = body.workingDirectory || getProjectDir();

    if (!isGitRepository(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
      });
    }

    try {
      fetchBranch(workingDirectory, {
        branch: body.branch,
        remote: body.remote,
        force: body.force,
        all: body.all,
        prune: body.prune,
        pruneTags: body.pruneTags,
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
      branch: body.branch,
      remote: body.remote,
      all: body.all,
      prune: body.prune,
    });

    return { success: true };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error during git fetch", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch",
    });
  }
});
