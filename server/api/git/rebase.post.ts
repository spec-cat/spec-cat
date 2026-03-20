import { rebaseBranch } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromBody, handleGitApiError } from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event) => {
  try {
    const { workingDirectory, body } = await resolveWorkingDirectoryFromBody(event);
    const typedBody = body as { onto: string };

    if (!typedBody.onto) {
      throw createError({
        statusCode: 400,
        statusMessage: "onto is required",
      });
    }

    try {
      rebaseBranch(workingDirectory, typedBody.onto);
    } catch (gitError) {
      const errorMessage =
        gitError instanceof Error ? gitError.message : "Unknown error";

      if (
        errorMessage.includes("CONFLICT") ||
        errorMessage.includes("could not apply") ||
        errorMessage.includes("merge conflict")
      ) {
        throw createError({
          statusCode: 409,
          statusMessage: `Rebase conflict: ${errorMessage}`,
        });
      }

      if (errorMessage.includes("does not point to a valid commit")) {
        throw createError({
          statusCode: 404,
          statusMessage: `Target '${typedBody.onto}' not found`,
        });
      }

      throw createError({
        statusCode: 500,
        statusMessage: `Git rebase failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git rebase successful", { onto: typedBody.onto });

    return { success: true };
  } catch (error) {
    handleGitApiError(error, "Error during git rebase", "Failed to rebase branch");
  }
});
