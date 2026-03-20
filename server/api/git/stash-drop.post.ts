import { dropStash } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromBody, handleGitApiError } from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event) => {
  try {
    const { workingDirectory, body } = await resolveWorkingDirectoryFromBody(event);

    if (typeof body.index !== "number") {
      throw createError({
        statusCode: 400,
        statusMessage: "index is required and must be a number",
      });
    }

    try {
      dropStash(workingDirectory, body.index as number);
    } catch (gitError) {
      const errorMessage = gitError instanceof Error ? gitError.message : "Unknown error";
      throw createError({
        statusCode: 500,
        statusMessage: `Stash drop failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git stash dropped", { index: body.index });

    return { success: true };
  } catch (error) {
    handleGitApiError(error, "Error dropping stash", "Failed to drop stash");
  }
});
