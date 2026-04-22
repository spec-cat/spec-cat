import type { GitStageRequest, GitStageResponse } from "~/types/git";
import { execGitArgs } from "~/server/utils/gitExec";
import { parseGitStatusPorcelain } from "~/server/utils/gitParsers";
import { logger } from "~/server/utils/logger";
import {
  resolveWorkingDirectoryFromBody,
  handleGitApiError,
} from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event): Promise<GitStageResponse> => {
  try {
    const { workingDirectory, body } = await resolveWorkingDirectoryFromBody(event);
    const files = (body as unknown as GitStageRequest).files;

    if (files.length === 0) {
      // Stage all changes
      execGitArgs(workingDirectory, ["add", "-A"]);
    } else {
      // Stage specific files
      execGitArgs(workingDirectory, ["add", "--", ...files]);
    }

    // Count staged files after operation
    const statusOutput = execGitArgs(workingDirectory, ["status", "--porcelain"]);
    const { stagedFiles } = parseGitStatusPorcelain(statusOutput);
    const stagedCount = stagedFiles.length;

    logger.api.info("Git stage successful", {
      files: files.length === 0 ? "all" : files,
      stagedCount,
    });

    return { success: true, stagedCount };
  } catch (error) {
    handleGitApiError(error, "Error staging files", "Failed to stage files");
  }
});
