import { isGitRepositorySync, createTag, pushTag } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      workingDirectory?: string;
      name: string;
      hash: string;
      annotated?: boolean;
      message?: string;
      pushToRemote?: string;
    }>(event);
    const workingDirectory = body.workingDirectory || getProjectDir();

    if (!body.name) {
      throw createError({
        statusCode: 400,
        statusMessage: "Tag name is required",
      });
    }

    if (!body.hash) {
      throw createError({
        statusCode: 400,
        statusMessage: "Commit hash is required",
      });
    }

    if (!isGitRepositorySync(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
      });
    }

    try {
      createTag(workingDirectory, body.name, body.hash, {
        annotated: body.annotated,
        message: body.message,
      });

      if (body.pushToRemote) {
        pushTag(workingDirectory, body.name, body.pushToRemote);
      }
    } catch (gitError) {
      const errorMessage =
        gitError instanceof Error ? gitError.message : "Unknown error";
      throw createError({
        statusCode: 500,
        statusMessage: `Tag creation failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git tag created", {
      name: body.name,
      hash: body.hash,
      annotated: body.annotated,
      pushed: !!body.pushToRemote,
    });

    return { success: true };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error creating git tag", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to create tag",
    });
  }
});
