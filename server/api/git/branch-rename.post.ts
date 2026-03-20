import { renameBranch } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromBody, handleGitApiError } from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event) => {
  try {
    const { workingDirectory, body } = await resolveWorkingDirectoryFromBody(event);

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

    try {
      renameBranch(workingDirectory, body.oldName as string, body.newName as string);
    } catch (gitError) {
      const errorMessage =
        gitError instanceof Error ? gitError.message : "Unknown error";

      if (errorMessage.includes("not found") || errorMessage.includes("did not match")) {
        throw createError({
          statusCode: 404,
          statusMessage: `Branch '${body.oldName as string}' not found`,
        });
      }

      if (errorMessage.includes("already exists")) {
        throw createError({
          statusCode: 409,
          statusMessage: `Branch '${body.newName as string}' already exists`,
        });
      }

      throw createError({
        statusCode: 500,
        statusMessage: `Git branch rename failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git branch renamed", {
      oldName: body.oldName as string,
      newName: body.newName as string,
    });

    return { success: true };
  } catch (error) {
    handleGitApiError(error, "Error renaming git branch", "Failed to rename branch");
  }
});
