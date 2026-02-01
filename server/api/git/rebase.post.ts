import { isGitRepository, rebaseBranch } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      workingDirectory?: string;
      onto: string;
    }>(event);
    const workingDirectory = body.workingDirectory || getProjectDir();

    if (!body.onto) {
      throw createError({
        statusCode: 400,
        statusMessage: "onto is required",
      });
    }

    if (!isGitRepository(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
      });
    }

    try {
      rebaseBranch(workingDirectory, body.onto);
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
          statusMessage: `Target '${body.onto}' not found`,
        });
      }

      throw createError({
        statusCode: 500,
        statusMessage: `Git rebase failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git rebase successful", { onto: body.onto });

    return { success: true };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error during git rebase", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to rebase branch",
    });
  }
});
