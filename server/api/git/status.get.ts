import type { GitStatusResponse, GitStatusFile } from "~/types/git";
import { FileChangeStatus } from "~/types/git";
import { isGitRepository, execGit } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";

/**
 * GET /api/git/status
 * Returns uncommitted changes separated into stagedFiles and unstagedFiles.
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

    if (!isGitRepository(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
        data: { code: "NOT_GIT_REPO" },
      });
    }

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
          status = FileChangeStatus.Added; // Untracked = Added (new file)
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
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error reading git status", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to read git status",
    });
  }
});
