import type { GitStageRequest, GitStageResponse } from "~/types/git";
import { isGitRepository, execGitArgs } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

export default defineEventHandler(async (event): Promise<GitStageResponse> => {
  try {
    const body = await readBody<GitStageRequest>(event);
    const workingDirectory = body.workingDirectory || getProjectDir();

    if (!isGitRepository(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
        data: { code: "NOT_GIT_REPO" },
      });
    }

    if (body.files.length === 0) {
      // Stage all changes
      execGitArgs(workingDirectory, ["add", "-A"]);
    } else {
      // Stage specific files
      execGitArgs(workingDirectory, ["add", "--", ...body.files]);
    }

    // Count staged files after operation
    const statusOutput = execGitArgs(workingDirectory, ["status", "--porcelain"]);
    const lines = statusOutput.trim().split("\n").filter(Boolean);
    let stagedCount = 0;
    for (const line of lines) {
      const stagingStatus = line.charAt(0);
      if (stagingStatus !== " " && stagingStatus !== "?") {
        stagedCount++;
      }
    }

    logger.api.info("Git stage successful", {
      files: body.files.length === 0 ? "all" : body.files,
      stagedCount,
    });

    return { success: true, stagedCount };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error staging files", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to stage files",
    });
  }
});
