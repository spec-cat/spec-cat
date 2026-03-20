import { stashBranch } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromBody, handleGitApiError } from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event) => {
  try {
    const { workingDirectory, body } = await resolveWorkingDirectoryFromBody(event);

    if (!body.branchName) {
      throw createError({
        statusCode: 400,
        statusMessage: "branchName is required",
      });
    }

    if (typeof body.index !== "number") {
      throw createError({
        statusCode: 400,
        statusMessage: "index is required and must be a number",
      });
    }

    try {
      stashBranch(workingDirectory, body.branchName as string, body.index as number);
    } catch (gitError) {
      const errorMessage = gitError instanceof Error ? gitError.message : "Unknown error";
      throw createError({
        statusCode: 500,
        statusMessage: `Stash branch failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git stash branch created", {
      branchName: body.branchName,
      index: body.index,
    });

    return { success: true };
  } catch (error) {
    handleGitApiError(error, "Error creating branch from stash", "Failed to create branch from stash");
  }
});
