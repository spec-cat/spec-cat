import type { GitShowResponse } from "~/types/git";
import {
  getCommitDetailSync,
  getCommitFiles,
  getCommitStats,
} from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromQuery, handleGitApiError } from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event) => {
  try {
    const workingDirectory = resolveWorkingDirectoryFromQuery(event);
    const query = getQuery(event);
    const hash = query.hash as string | undefined;

    if (!hash) {
      throw createError({
        statusCode: 400,
        statusMessage: "hash query parameter is required",
      });
    }

    // Get commit details
    const commit = getCommitDetailSync(workingDirectory, hash);
    if (!commit) {
      throw createError({
        statusCode: 404,
        statusMessage: "Commit not found",
      });
    }

    // Get file changes (FR-007)
    const files = getCommitFiles(workingDirectory, hash);

    // Get commit stats
    const stats = getCommitStats(workingDirectory, hash);

    const response: GitShowResponse = {
      commit,
      files,
      stats,
    };

    return response;
  } catch (error) {
    handleGitApiError(error, "Error reading commit details", "Failed to read commit details");
  }
});
