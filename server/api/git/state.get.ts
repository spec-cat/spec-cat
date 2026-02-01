import type { GitStateResponse, RepositoryState } from "~/types/git";
import {
  isGitRepositorySync,
  getHeadCommit,
  getBranchListHash,
  getUncommittedFileCount,
  getWorkingTreeHash,
  getStashListHash,
} from "~/server/utils/git";
import { logger } from "~/server/utils/logger";

/**
 * GET /api/git/state
 * Returns a lightweight repository state snapshot for change detection (FR-029, FR-030).
 * This endpoint is designed to be fast (<500ms per NFR-004) for polling every 5 seconds.
 */
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

    // Check if directory is a git repository (NFR-003)
    if (!isGitRepositorySync(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
        data: { code: "NOT_GIT_REPO" },
      });
    }

    // Build repository state snapshot
    const state: RepositoryState = {
      headCommit: getHeadCommit(workingDirectory),
      branchListHash: getBranchListHash(workingDirectory),
      uncommittedFileCount: getUncommittedFileCount(workingDirectory),
      workingTreeHash: getWorkingTreeHash(workingDirectory),
      stashListHash: getStashListHash(workingDirectory),
      timestamp: Date.now(),
    };

    const response: GitStateResponse = { state };

    return response;
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error reading git state", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to read git state",
    });
  }
});
