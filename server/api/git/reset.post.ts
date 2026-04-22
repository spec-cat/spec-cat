import { resetBranch } from "~/server/utils/gitBranchOperations";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromBody, handleGitApiError } from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event) => {
  try {
    const { workingDirectory, body } = await resolveWorkingDirectoryFromBody(event);
    const typedBody = body as { hash: string; mode: "soft" | "mixed" | "hard" };

    if (!typedBody.hash) {
      throw createError({
        statusCode: 400,
        statusMessage: "hash is required",
      });
    }

    if (!typedBody.mode) {
      throw createError({
        statusCode: 400,
        statusMessage: "mode is required",
      });
    }

    const validModes = ["soft", "mixed", "hard"];
    if (!validModes.includes(typedBody.mode)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid mode '${typedBody.mode}'. Must be one of: soft, mixed, hard`,
      });
    }

    try {
      resetBranch(workingDirectory, typedBody.hash, typedBody.mode);
    } catch (gitError) {
      const errorMessage = gitError instanceof Error ? gitError.message : "Unknown error";

      throw createError({
        statusCode: 500,
        statusMessage: `Reset failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git reset successful", { hash: typedBody.hash, mode: typedBody.mode });

    return { success: true };
  } catch (error) {
    handleGitApiError(error, "Error during git reset", "Failed to reset branch");
  }
});
