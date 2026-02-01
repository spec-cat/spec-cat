import { isGitRepositorySync, getDiff } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const workingDirectory = query.workingDirectory as string | undefined;
    const from = query.from as string | undefined;
    const to = query.to as string | undefined;

    if (!workingDirectory) {
      throw createError({
        statusCode: 400,
        statusMessage: "workingDirectory query parameter is required",
      });
    }

    if (!from) {
      throw createError({
        statusCode: 400,
        statusMessage: "from query parameter is required",
      });
    }

    if (!to) {
      throw createError({
        statusCode: 400,
        statusMessage: "to query parameter is required",
      });
    }

    if (!isGitRepositorySync(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
        data: { code: "NOT_GIT_REPO" },
      });
    }

    try {
      return getDiff(workingDirectory, from, to);
    } catch (gitError) {
      const errorMessage = gitError instanceof Error ? gitError.message : "Unknown error";

      throw createError({
        statusCode: 500,
        statusMessage: `Diff failed: ${errorMessage}`,
      });
    }
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error getting git diff", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to get diff",
    });
  }
});
