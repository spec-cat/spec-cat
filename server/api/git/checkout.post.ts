import type { GitCheckoutRequest, GitCheckoutResponse } from "~/types/git";
import { isGitRepository, execGit } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

export default defineEventHandler(async (event): Promise<GitCheckoutResponse> => {
  try {
    const body = await readBody<GitCheckoutRequest>(event);
    const workingDirectory = body.workingDirectory || getProjectDir();

    if (!body.branchName) {
      throw createError({
        statusCode: 400,
        statusMessage: "branchName is required",
      });
    }

    // Check if directory is a git repository (NFR-003)
    if (!(await isGitRepository(workingDirectory))) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
        data: { code: "NOT_GIT_REPO" },
      });
    }
    const currentBranchRaw = execGit(workingDirectory, "rev-parse --abbrev-ref HEAD").trim();
    const previousBranch = currentBranchRaw && currentBranchRaw !== "HEAD" ? currentBranchRaw : undefined;

    // Build git command
    let gitCommand: string;

    if (body.createBranch) {
      // Create branch without checkout: git branch <name> [<start-point>]
      gitCommand = `branch "${body.branchName}"`;
      if (body.fromCommit) {
        gitCommand += ` "${body.fromCommit}"`;
      }
    } else {
      // Checkout existing branch
      gitCommand = `checkout "${body.branchName}"`;
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
          statusMessage: `Branch '${body.branchName}' already exists`,
        });
      }

      if (errorMessage.includes("did not match any")) {
        throw createError({
          statusCode: 404,
          statusMessage: `Branch '${body.branchName}' not found`,
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
      branch: body.branchName,
      newHead,
      createBranch: body.createBranch,
    });

    return {
      success: true,
      newHead,
      newBranch: body.createBranch ? body.branchName : undefined,
      previousBranch,
    };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error during git checkout", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to checkout branch",
    });
  }
});
