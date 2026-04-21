import type { GitStatusResponse } from "~/types/git";
import { execGit, parseGitStatusPorcelain } from "~/server/utils/git";
import {
  resolveWorkingDirectoryFromQuery,
  handleGitApiError,
} from "~/server/utils/gitApiHelpers";

/**
 * GET /api/git/status
 * Returns uncommitted changes separated into stagedFiles and unstagedFiles.
 */
export default defineEventHandler(async (event) => {
  try {
    const workingDirectory = resolveWorkingDirectoryFromQuery(event);

    const output = execGit(workingDirectory, "status --porcelain");
    const { stagedFiles, unstagedFiles } = parseGitStatusPorcelain(output);

    const response: GitStatusResponse = {
      stagedFiles,
      unstagedFiles,
      hasChanges: stagedFiles.length > 0 || unstagedFiles.length > 0,
      stagedCount: stagedFiles.length,
      unstagedCount: unstagedFiles.length,
    };

    return response;
  } catch (error) {
    handleGitApiError(error, "Error reading git status", "Failed to read git status");
  }
});
