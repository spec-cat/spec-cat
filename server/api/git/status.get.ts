import type { GitStatusResponse, GitStatusFile } from "~/types/git";
import { FileChangeStatus } from "~/types/git";
import { execGit } from "~/server/utils/git";
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
    const lines = output.trim().split("\n").filter(Boolean);

    const stagedFiles: GitStatusFile[] = [];
    const unstagedFiles: GitStatusFile[] = [];

    for (const line of lines) {
      if (line.length < 3) continue;

      const stagingStatus = line.charAt(0);
      const workingStatus = line.charAt(1);
      const filePath = line.substring(3);

      // Parse file path (handle renames: "old -> new")
      let path = filePath;
      let oldPath: string | undefined;

      if (filePath.includes(" -> ")) {
        const parts = filePath.split(" -> ");
        oldPath = parts[0];
        path = parts[1];
      }

      // Determine status for staged entry
      if (stagingStatus !== " " && stagingStatus !== "?") {
        let status: FileChangeStatus;
        if (stagingStatus === "A") status = FileChangeStatus.Added;
        else if (stagingStatus === "D") status = FileChangeStatus.Deleted;
        else if (stagingStatus === "R") status = FileChangeStatus.Renamed;
        else if (stagingStatus === "C") status = FileChangeStatus.Copied;
        else status = FileChangeStatus.Modified;

        const file: GitStatusFile = {
          path,
          status,
          staged: true,
          unstaged: false,
        };
        if (oldPath) file.oldPath = oldPath;
        stagedFiles.push(file);
      }

      // Determine status for unstaged entry
      const isUntracked = stagingStatus === "?" && workingStatus === "?";
      if (workingStatus !== " " || isUntracked) {
        let status: FileChangeStatus;
        if (isUntracked) {
          status = FileChangeStatus.Added;
        } else if (workingStatus === "D") {
          status = FileChangeStatus.Deleted;
        } else {
          status = FileChangeStatus.Modified;
        }

        const file: GitStatusFile = {
          path,
          status,
          staged: false,
          unstaged: true,
        };
        if (oldPath) file.oldPath = oldPath;
        unstagedFiles.push(file);
      }
    }

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
