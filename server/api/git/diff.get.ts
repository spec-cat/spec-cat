import { getDiff } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromQuery, handleGitApiError } from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event) => {
  try {
    const workingDirectory = resolveWorkingDirectoryFromQuery(event);
    const query = getQuery(event);
    const from = query.from as string | undefined;
    const to = query.to as string | undefined;

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
    handleGitApiError(error, "Error getting git diff", "Failed to get diff");
  }
});
