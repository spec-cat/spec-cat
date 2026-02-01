import { isGitRepository, stashBranch } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      workingDirectory?: string;
      index: number;
      branchName: string;
    }>(event);
    const workingDirectory = body.workingDirectory || getProjectDir();

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

    if (!isGitRepository(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
        data: { code: "NOT_GIT_REPO" },
      });
    }

    try {
      stashBranch(workingDirectory, body.branchName, body.index);
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
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error creating branch from stash", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to create branch from stash",
    });
  }
});
