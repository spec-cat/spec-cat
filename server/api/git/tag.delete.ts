import { deleteTag, deleteRemoteTag } from "~/server/utils/git";
import { resolveWorkingDirectoryFromBody, handleGitApiError } from "~/server/utils/gitApiHelpers";
import { logger } from "~/server/utils/logger";

export default defineEventHandler(async (event) => {
  try {
    const { workingDirectory, body } = await resolveWorkingDirectoryFromBody(event);

    if (!body.name) {
      throw createError({
        statusCode: 400,
        statusMessage: "Tag name is required",
      });
    }

    try {
      deleteTag(workingDirectory, body.name as string);

      if (body.deleteFromRemote) {
        deleteRemoteTag(workingDirectory, body.name as string, body.deleteFromRemote as string);
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
    handleGitApiError(error, "deleting git tag", "Failed to delete tag");
  }
});
