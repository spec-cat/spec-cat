import { isGitRepositorySync, deleteTag, deleteRemoteTag } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      workingDirectory?: string;
      name: string;
      deleteFromRemote?: string;
    }>(event);
    const workingDirectory = body.workingDirectory || getProjectDir();

    if (!body.name) {
      throw createError({
        statusCode: 400,
        statusMessage: "Tag name is required",
      });
    }

    if (!isGitRepositorySync(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
      });
    }

    try {
      deleteTag(workingDirectory, body.name);

      if (body.deleteFromRemote) {
        deleteRemoteTag(workingDirectory, body.name, body.deleteFromRemote);
      }
    } catch (gitError) {
      const errorMessage =
        gitError instanceof Error ? gitError.message : "Unknown error";
      throw createError({
        statusCode: 500,
        statusMessage: `Tag deletion failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git tag deleted", {
      name: body.name,
      deletedFromRemote: !!body.deleteFromRemote,
    });

    return { success: true };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error deleting git tag", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to delete tag",
    });
  }
});
