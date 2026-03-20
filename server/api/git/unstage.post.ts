import type { GitUnstageResponse } from "~/types/git";
import { execGitArgs } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromBody, handleGitApiError } from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event): Promise<GitUnstageResponse> => {
  try {
    const { workingDirectory, body } = await resolveWorkingDirectoryFromBody(event);

    if ((body.files as string[]).length === 0) {
      // Unstage all
      execGitArgs(workingDirectory, ["reset", "HEAD"]);
    } else {
      // Unstage specific files
      execGitArgs(workingDirectory, ["reset", "HEAD", "--", ...(body.files as string[])]);
    }

    // Count unstaged files after operation
    const statusOutput = execGitArgs(workingDirectory, ["status", "--porcelain"]);
    const lines = statusOutput.trim().split("\n").filter(Boolean);
    let unstagedCount = 0;
    for (const line of lines) {
      const stagingStatus = line.charAt(0);
      const workingStatus = line.charAt(1);
      if (workingStatus !== " " || stagingStatus === "?") {
        unstagedCount++;
      }
    }

    logger.api.info("Git unstage successful", {
      files: (body.files as string[]).length === 0 ? "all" : body.files,
      unstagedCount,
    });

    return { success: true, unstagedCount };
  } catch (error) {
    handleGitApiError(error, "Error unstaging files", "Failed to unstage files");
  }
});
