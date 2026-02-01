import type { GitCommitRequest, GitCommitResponse } from "~/types/git";
import { isGitRepository, execGitArgs } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

export default defineEventHandler(async (event): Promise<GitCommitResponse> => {
  try {
    const body = await readBody<GitCommitRequest>(event);
    const workingDirectory = body.workingDirectory || getProjectDir();

    if (!body.message || !body.message.trim()) {
      throw createError({
        statusCode: 400,
        statusMessage: "Commit message is required",
      });
    }

    if (!isGitRepository(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
        data: { code: "NOT_GIT_REPO" },
      });
    }

    // Check that there are staged changes
    const statusOutput = execGitArgs(workingDirectory, ["status", "--porcelain"]);
    const lines = statusOutput.trim().split("\n").filter(Boolean);
    const hasStagedChanges = lines.some((line) => {
      const stagingStatus = line.charAt(0);
      return stagingStatus !== " " && stagingStatus !== "?";
    });

    if (!hasStagedChanges) {
      throw createError({
        statusCode: 400,
        statusMessage: "No staged changes to commit",
      });
    }

    // Use execFileSync via execGitArgs to prevent shell injection
    try {
      execGitArgs(workingDirectory, ["commit", "-m", body.message.trim()]);
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
      message: body.message.trim(),
    });

    return { success: true, hash, shortHash };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error creating git commit", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to create commit",
    });
  }
});
