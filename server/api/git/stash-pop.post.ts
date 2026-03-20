import { popStash } from "~/server/utils/git";
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
      popStash(workingDirectory, body.index as number, body.reinstateIndex as boolean | undefined);
    } catch (gitError) {
      const errorMessage = gitError instanceof Error ? gitError.message : "Unknown error";
      throw createError({
        statusCode: 500,
        statusMessage: `Stash pop failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git stash popped", {
      index: body.index,
      reinstateIndex: body.reinstateIndex,
    });

    return { success: true };
  } catch (error) {
    handleGitApiError(error, "Error popping stash", "Failed to pop stash");
  }
});
