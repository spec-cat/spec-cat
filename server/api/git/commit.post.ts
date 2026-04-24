import type { GitCommitResponse } from "~/types/git";
import { execGitArgs } from "~/server/utils/gitExec";
import { parseGitStatusPorcelain } from "~/server/utils/gitParsers";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromBody, handleGitApiError } from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event): Promise<GitCommitResponse> => {
  try {
    const { workingDirectory, body } = await resolveWorkingDirectoryFromBody(event);

    if (!body.message || !(body.message as string).trim()) {
      throw createError({
        statusCode: 400,
        statusMessage: "Commit message is required",
      });
    }

    // Check that there are staged changes
    const statusOutput = execGitArgs(workingDirectory, ["status", "--porcelain"], { trim: false });
    const { stagedFiles } = parseGitStatusPorcelain(statusOutput);
    const hasStagedChanges = stagedFiles.length > 0;

    if (!hasStagedChanges) {
      throw createError({
        statusCode: 400,
        statusMessage: "No staged changes to commit",
      });
    }

    // Use execFileSync via execGitArgs to prevent shell injection
    try {
      execGitArgs(workingDirectory, ["commit", "-m", (body.message as string).trim()]);
    } catch (gitError) {
      const errorMessage = gitError instanceof Error ? gitError.message : "Unknown error";

      if (errorMessage.includes("nothing to commit")) {
        throw createError({
          statusCode: 400,
          statusMessage: "Nothing to commit",
        });
      }

      throw createError({
        statusCode: 500,
        statusMessage: `Git commit failed: ${errorMessage}`,
      });
    }

    // Get the new commit hash
    const hash = execGitArgs(workingDirectory, ["rev-parse", "HEAD"]);
    const shortHash = execGitArgs(workingDirectory, ["rev-parse", "--short", "HEAD"]);

    logger.api.info("Git commit successful", {
      hash,
      shortHash,
      message: (body.message as string).trim(),
    });

    return { success: true, hash, shortHash };
  } catch (error) {
    handleGitApiError(error, "Error creating git commit", "Failed to create commit");
  }
});
