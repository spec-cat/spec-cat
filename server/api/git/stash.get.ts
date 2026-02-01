import { isGitRepository, listStashes } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const workingDirectory = query.workingDirectory as string | undefined;

    if (!workingDirectory) {
      throw createError({
        statusCode: 400,
        statusMessage: "workingDirectory query parameter is required",
      });
    }

    if (!isGitRepository(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
        data: { code: "NOT_GIT_REPO" },
      });
    }

    const stashes = listStashes(workingDirectory);

    return { stashes };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error listing stashes", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to list stashes",
    });
  }
});
