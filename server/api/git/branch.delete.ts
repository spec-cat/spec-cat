import { isGitRepository, execGitArgs } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";
import { getProjectDir } from "~/server/utils/projectDir";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      workingDirectory?: string;
      branchName: string;
      force?: boolean;
      remote?: boolean;
    }>(event);
    const workingDirectory = body.workingDirectory || getProjectDir();
    const branchName = body.branchName;
    const force = body.force ?? false;
    const remote = body.remote ?? false;

    if (!branchName) {
      throw createError({
        statusCode: 400,
        statusMessage: "branchName is required",
      });
    }

    // Check if directory is a git repository
    if (!(await isGitRepository(workingDirectory))) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
      });
    }

    try {
      if (remote) {
        // Remote branch: "origin/feature" → git push origin --delete feature
        const slashIndex = branchName.indexOf("/");
        if (slashIndex <= 0) {
          throw createError({
            statusCode: 400,
            statusMessage: `Invalid remote branch format: '${branchName}'. Expected 'remote/branch'.`,
          });
        }
        const remoteName = branchName.substring(0, slashIndex);
        const remoteBranch = branchName.substring(slashIndex + 1);
        execGitArgs(workingDirectory, ["push", remoteName, "--delete", remoteBranch]);
      } else {
        // Local branch
        const flag = force ? "-D" : "-d";
        execGitArgs(workingDirectory, ["branch", flag, branchName]);
      }
    } catch (gitError) {
      const errorMessage = gitError instanceof Error ? gitError.message : "Unknown error";

      if (errorMessage.includes("not fully merged")) {
        throw createError({
          statusCode: 409,
          statusMessage: `Branch '${branchName}' is not fully merged. Use force delete if you want to delete it anyway.`,
        });
      }

      if (errorMessage.includes("not found") || errorMessage.includes("did not match")) {
        throw createError({
          statusCode: 404,
          statusMessage: `Branch '${branchName}' not found`,
        });
      }

      if (errorMessage.includes("Cannot delete") || errorMessage.includes("checked out")) {
        throw createError({
          statusCode: 409,
          statusMessage: `Cannot delete branch '${branchName}': it is currently checked out`,
        });
      }

      throw createError({
        statusCode: 500,
        statusMessage: `Git branch delete failed: ${errorMessage}`,
      });
    }

    logger.api.info("Git branch deleted", { branch: branchName, force, remote });

    return {
      success: true,
    };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error deleting git branch", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to delete branch",
    });
  }
});
