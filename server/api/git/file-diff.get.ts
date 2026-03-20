import { getFileDiff } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromQuery, handleGitApiError } from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event) => {
  try {
    const workingDirectory = resolveWorkingDirectoryFromQuery(event);
    const query = getQuery(event);
    const commitHash = query.commitHash as string | undefined;
    const filePath = query.filePath as string | undefined;
    const parentHash = query.parentHash as string | undefined;

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
    handleGitApiError(error, "Error getting file diff", "Failed to get file diff");
  }
});
