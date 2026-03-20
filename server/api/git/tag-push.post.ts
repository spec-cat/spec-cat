import { pushTag } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromBody, handleGitApiError } from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event) => {
  try {
    const { workingDirectory, body } = await resolveWorkingDirectoryFromBody(event);
    const typedBody = body as { name: string; remote?: string };

    if (!typedBody.name) {
      throw createError({
        statusCode: 400,
        statusMessage: "Tag name is required",
      });
    }

    try {
      pushTag(workingDirectory, typedBody.name, typedBody.remote || "origin");
    } catch (gitError) {
      const errorMessage =
        gitError instanceof Error ? gitError.message : "Unknown error";
      throw createError({
        statusCode: 500,
        statusMessage: `Tag push failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git tag pushed", {
      name: typedBody.name,
      remote: typedBody.remote || "origin",
    });

    return { success: true };
  } catch (error) {
    handleGitApiError(error, "Error pushing git tag", "Failed to push tag");
  }
});
