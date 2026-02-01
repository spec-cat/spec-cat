import type { GitUnstageRequest, GitUnstageResponse } from "~/types/git";
import { isGitRepository, execGitArgs } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

export default defineEventHandler(async (event): Promise<GitUnstageResponse> => {
  try {
    const body = await readBody<GitUnstageRequest>(event);
    const workingDirectory = body.workingDirectory || getProjectDir();

    if (!isGitRepository(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
        data: { code: "NOT_GIT_REPO" },
      });
    }

    if (body.files.length === 0) {
      // Unstage all
      execGitArgs(workingDirectory, ["reset", "HEAD"]);
    } else {
      // Unstage specific files
      execGitArgs(workingDirectory, ["reset", "HEAD", "--", ...body.files]);
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
      files: body.files.length === 0 ? "all" : body.files,
      unstagedCount,
    });

    return { success: true, unstagedCount };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error unstaging files", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to unstage files",
    });
  }
});
