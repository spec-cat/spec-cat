import type { GitStateResponse, RepositoryState } from "~/types/git";
import {
  getHeadCommit,
  getBranchListHash,
  getUncommittedFileCount,
  getWorkingTreeHash,
  getStashListHash,
} from "~/server/utils/git";
import {
  resolveWorkingDirectoryFromQuery,
  handleGitApiError,
} from "~/server/utils/gitApiHelpers";

/**
 * GET /api/git/state
 * Returns a lightweight repository state snapshot for change detection (FR-029, FR-030).
 * This endpoint is designed to be fast (<500ms per NFR-004) for polling every 5 seconds.
 */
export default defineEventHandler(async (event) => {
  try {
    const workingDirectory = resolveWorkingDirectoryFromQuery(event);

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
    handleGitApiError(error, "Error reading git state", "Failed to read git state");
  }
});
