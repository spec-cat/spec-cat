import { isGitRepositorySync, getFileDiff } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const workingDirectory = query.workingDirectory as string | undefined;
    const commitHash = query.commitHash as string | undefined;
    const filePath = query.filePath as string | undefined;
    const parentHash = query.parentHash as string | undefined;

    if (!workingDirectory) {
      throw createError({
        statusCode: 400,
        statusMessage: "workingDirectory query parameter is required",
      });
    }

    if (!commitHash) {
      throw createError({
        statusCode: 400,
        statusMessage: "commitHash query parameter is required",
      });
    }

    if (!filePath) {
      throw createError({
        statusCode: 400,
        statusMessage: "filePath query parameter is required",
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
      return getFileDiff(workingDirectory, commitHash, filePath, parentHash || undefined);
    } catch (gitError) {
      const errorMessage = gitError instanceof Error ? gitError.message : "Unknown error";

      throw createError({
        statusCode: 500,
        statusMessage: `File diff failed: ${errorMessage}`,
      });
    }
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error getting file diff", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to get file diff",
    });
  }
});
