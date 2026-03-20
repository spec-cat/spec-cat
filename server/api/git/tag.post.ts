import { createTag, pushTag } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromBody, handleGitApiError } from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event) => {
  try {
    const { workingDirectory, body } = await resolveWorkingDirectoryFromBody(event);
    const typedBody = body as {
      name: string;
      hash: string;
      annotated?: boolean;
      message?: string;
      pushToRemote?: string;
    };

    if (!typedBody.name) {
      throw createError({
        statusCode: 400,
        statusMessage: "Tag name is required",
      });
    }

    if (!typedBody.hash) {
      throw createError({
        statusCode: 400,
        statusMessage: "Commit hash is required",
      });
    }

    try {
      createTag(workingDirectory, typedBody.name, typedBody.hash, {
        annotated: typedBody.annotated,
        message: typedBody.message,
      });

      if (typedBody.pushToRemote) {
        pushTag(workingDirectory, typedBody.name, typedBody.pushToRemote);
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
      name: typedBody.name,
      hash: typedBody.hash,
      annotated: typedBody.annotated,
      pushed: !!typedBody.pushToRemote,
    });

    return { success: true };
  } catch (error) {
    handleGitApiError(error, "Error creating git tag", "Failed to create tag");
  }
});
