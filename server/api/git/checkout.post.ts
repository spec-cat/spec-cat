import type { GitCheckoutResponse } from "~/types/git";
import { execGit } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { resolveWorkingDirectoryFromBody, handleGitApiError } from "~/server/utils/gitApiHelpers";

export default defineEventHandler(async (event): Promise<GitCheckoutResponse> => {
  try {
    const { workingDirectory, body } = await resolveWorkingDirectoryFromBody(event);

    if (!body.branchName) {
      throw createError({
        statusCode: 400,
        statusMessage: "branchName is required",
      });
    }
    const currentBranchRaw = execGit(workingDirectory, "rev-parse --abbrev-ref HEAD").trim();
    const previousBranch = currentBranchRaw && currentBranchRaw !== "HEAD" ? currentBranchRaw : undefined;

    // Build git command
    let gitCommand: string;

    if (body.createBranch) {
      // Create branch without checkout: git branch <name> [<start-point>]
      gitCommand = `branch "${body.branchName as string}"`;
      if (body.fromCommit) {
        gitCommand += ` "${body.fromCommit as string}"`;
      }
    } else {
      // Checkout existing branch
      gitCommand = `checkout "${body.branchName as string}"`;
    }

    // Execute git command
    try {
      execGit(workingDirectory, gitCommand);
    } catch (gitError) {
      const errorMessage = gitError instanceof Error ? gitError.message : "Unknown error";

      // Check for common errors
      if (errorMessage.includes("already exists")) {
        throw createError({
          statusCode: 409,
          statusMessage: `Branch '${body.branchName as string}' already exists`,
        });
      }

      if (errorMessage.includes("did not match any")) {
        throw createError({
          statusCode: 404,
          statusMessage: `Branch '${body.branchName as string}' not found`,
        });
      }

      if (errorMessage.includes("local changes")) {
        throw createError({
          statusCode: 409,
          statusMessage: "Cannot checkout: you have local changes. Please commit or stash them first.",
        });
      }

      throw createError({
        statusCode: 500,
        statusMessage: `Git checkout failed: ${errorMessage}`,
      });
    }

    // Get new HEAD commit hash
    const newHead = execGit(workingDirectory, "rev-parse HEAD").trim();

    logger.api.info("Git checkout successful", {
      branch: body.branchName as string,
      newHead,
      createBranch: body.createBranch as boolean | undefined,
    });

    return {
      success: true,
      newHead,
      newBranch: body.createBranch ? (body.branchName as string) : undefined,
      previousBranch,
    };
  } catch (error) {
    handleGitApiError(error, "Error during git checkout", "Failed to checkout branch");
  }
});
