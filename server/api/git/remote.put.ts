import { isGitRepositorySync, editRemote } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

/**
 * PUT /api/git/remote
 * Updates the URL of an existing remote.
 */
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      workingDirectory?: string;
      name: string;
      newUrl: string;
    }>(event);
    const workingDirectory = body.workingDirectory || getProjectDir();

    if (!body.name) {
      throw createError({
        statusCode: 400,
        statusMessage: "name is required",
      });
    }

    if (!body.newUrl) {
      throw createError({
        statusCode: 400,
        statusMessage: "newUrl is required",
      });
    }

    if (!isGitRepositorySync(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
      });
    }

    try {
      editRemote(workingDirectory, body.name, body.newUrl);
    } catch (gitError) {
      const errorMessage =
        gitError instanceof Error ? gitError.message : "Unknown error";
      throw createError({
        statusCode: 500,
        statusMessage: `Failed to edit remote: ${errorMessage}`,
      });
    }

    logger.api.info("Git remote updated", {
      name: body.name,
      newUrl: body.newUrl,
    });

    return { success: true };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error editing git remote", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to edit remote",
    });
  }
});
