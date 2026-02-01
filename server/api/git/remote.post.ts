import { isGitRepositorySync, addRemote } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

/**
 * POST /api/git/remote
 * Adds a new remote to the repository.
 */
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      workingDirectory?: string;
      name: string;
      url: string;
    }>(event);
    const workingDirectory = body.workingDirectory || getProjectDir();

    if (!body.name) {
      throw createError({
        statusCode: 400,
        statusMessage: "name is required",
      });
    }

    if (!body.url) {
      throw createError({
        statusCode: 400,
        statusMessage: "url is required",
      });
    }

    if (!isGitRepositorySync(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
      });
    }

    try {
      addRemote(workingDirectory, body.name, body.url);
    } catch (gitError) {
      const errorMessage =
        gitError instanceof Error ? gitError.message : "Unknown error";
      throw createError({
        statusCode: 500,
        statusMessage: `Failed to add remote: ${errorMessage}`,
      });
    }

    logger.api.info("Git remote added", { name: body.name, url: body.url });

    return { success: true };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error adding git remote", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to add remote",
    });
  }
});
