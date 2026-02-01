import { isGitRepository, popStash } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      workingDirectory?: string;
      index: number;
      reinstateIndex?: boolean;
    }>(event);
    const workingDirectory = body.workingDirectory || getProjectDir();

    if (typeof body.index !== "number") {
      throw createError({
        statusCode: 400,
        statusMessage: "index is required and must be a number",
      });
    }

    if (!isGitRepository(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
        data: { code: "NOT_GIT_REPO" },
      });
    }

    try {
      popStash(workingDirectory, body.index, body.reinstateIndex);
    } catch (gitError) {
      const errorMessage = gitError instanceof Error ? gitError.message : "Unknown error";
      throw createError({
        statusCode: 500,
        statusMessage: `Stash pop failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git stash popped", {
      index: body.index,
      reinstateIndex: body.reinstateIndex,
    });

    return { success: true };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error popping stash", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to pop stash",
    });
  }
});
