import { isGitRepository, createStash } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      workingDirectory?: string;
      message?: string;
      includeUntracked?: boolean;
    }>(event);
    const workingDirectory = body.workingDirectory || getProjectDir();

    if (!isGitRepository(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
        data: { code: "NOT_GIT_REPO" },
      });
    }

    try {
      createStash(workingDirectory, {
        message: body.message,
        includeUntracked: body.includeUntracked,
      });
    } catch (gitError) {
      const errorMessage = gitError instanceof Error ? gitError.message : "Unknown error";
      throw createError({
        statusCode: 500,
        statusMessage: `Stash creation failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git stash created", {
      message: body.message,
      includeUntracked: body.includeUntracked,
    });

    return { success: true };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error creating stash", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to create stash",
    });
  }
});
