import { isGitRepository, resetBranch } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      workingDirectory?: string;
      hash: string;
      mode: "soft" | "mixed" | "hard";
    }>(event);
    const workingDirectory = body.workingDirectory || getProjectDir();

    if (!body.hash) {
      throw createError({
        statusCode: 400,
        statusMessage: "hash is required",
      });
    }

    if (!body.mode) {
      throw createError({
        statusCode: 400,
        statusMessage: "mode is required",
      });
    }

    const validModes = ["soft", "mixed", "hard"];
    if (!validModes.includes(body.mode)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid mode '${body.mode}'. Must be one of: soft, mixed, hard`,
      });
    }

    if (!(await isGitRepository(workingDirectory))) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
      });
    }

    try {
      resetBranch(workingDirectory, body.hash, body.mode);
    } catch (gitError) {
      const errorMessage = gitError instanceof Error ? gitError.message : "Unknown error";

      throw createError({
        statusCode: 500,
        statusMessage: `Reset failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git reset successful", { hash: body.hash, mode: body.mode });

    return { success: true };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error during git reset", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to reset branch",
    });
  }
});
