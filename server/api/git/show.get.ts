import type { GitShowResponse } from "~/types/git";
import {
  isGitRepositorySync,
  getCommitDetailSync,
  getCommitFiles,
  getCommitStats,
} from "~/server/utils/git";
import { logger } from "~/server/utils/logger";

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const workingDirectory = query.workingDirectory as string | undefined;
    const hash = query.hash as string | undefined;

    if (!workingDirectory) {
      throw createError({
        statusCode: 400,
        statusMessage: "workingDirectory query parameter is required",
      });
    }

    if (!hash) {
      throw createError({
        statusCode: 400,
        statusMessage: "hash query parameter is required",
      });
    }

    // Check if directory is a git repository (NFR-003)
    if (!isGitRepositorySync(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
        data: { code: "NOT_GIT_REPO" },
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
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error reading commit details", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to read commit details",
    });
  }
});
