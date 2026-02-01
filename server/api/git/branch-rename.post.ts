import { isGitRepository, renameBranch } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      workingDirectory?: string;
      oldName: string;
      newName: string;
    }>(event);
    const workingDirectory = body.workingDirectory || getProjectDir();

    if (!body.oldName) {
      throw createError({
        statusCode: 400,
        statusMessage: "oldName is required",
      });
    }

    if (!body.newName) {
      throw createError({
        statusCode: 400,
        statusMessage: "newName is required",
      });
    }

    if (!isGitRepository(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
      });
    }

    try {
      renameBranch(workingDirectory, body.oldName, body.newName);
    } catch (gitError) {
      const errorMessage =
        gitError instanceof Error ? gitError.message : "Unknown error";

      if (errorMessage.includes("not found") || errorMessage.includes("did not match")) {
        throw createError({
          statusCode: 404,
          statusMessage: `Branch '${body.oldName}' not found`,
        });
      }

      if (errorMessage.includes("already exists")) {
        throw createError({
          statusCode: 409,
          statusMessage: `Branch '${body.newName}' already exists`,
        });
      }

      throw createError({
        statusCode: 500,
        statusMessage: `Git branch rename failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git branch renamed", {
      oldName: body.oldName,
      newName: body.newName,
    });

    return { success: true };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error renaming git branch", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to rename branch",
    });
  }
});
