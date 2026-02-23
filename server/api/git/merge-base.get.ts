import { isGitRepositorySync, getMergeBase, execGitCommand } from "~/server/utils/git";
import { logger } from "~/server/utils/logger";

/**
 * Find the fork-point (merge-base) for a feature branch against the default branch.
 * Detects the default branch automatically: origin/HEAD → main → master.
 */
export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const workingDirectory = query.workingDirectory as string | undefined;
    const branch = query.branch as string | undefined;
    const requestedBaseBranch = query.baseBranch as string | undefined;

    if (!workingDirectory) {
      throw createError({
        statusCode: 400,
        statusMessage: "workingDirectory query parameter is required",
      });
    }

    if (!branch) {
      throw createError({
        statusCode: 400,
        statusMessage: "branch query parameter is required",
      });
    }

    if (!isGitRepositorySync(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
        data: { code: "NOT_GIT_REPO" },
      });
    }

    // Detect default branch if no explicit base branch is provided
    const defaultBranch = await detectDefaultBranch(workingDirectory);
    const baseBranch = requestedBaseBranch?.trim() || defaultBranch;

    if (!baseBranch || baseBranch === branch) {
      // Feature IS the default branch, or no default found — no fork point
      return { mergeBase: null };
    }

    // If both refs currently point to the same commit, there are no
    // branch-only commits to highlight.
    const [branchHead, defaultHead] = await Promise.all([
      resolveRefHead(workingDirectory, branch),
      resolveRefHead(workingDirectory, baseBranch),
    ]);
    if (!defaultHead) {
      return { mergeBase: null };
    }
    if (branchHead && defaultHead && branchHead === defaultHead) {
      return { mergeBase: null };
    }

    const mergeBase = await getMergeBase(branch, baseBranch, workingDirectory);
    return { mergeBase };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error getting merge-base", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to get merge-base",
    });
  }
});

async function detectDefaultBranch(cwd: string): Promise<string | null> {
  // Try origin/HEAD first
  try {
    const ref = await execGitCommand(['symbolic-ref', 'refs/remotes/origin/HEAD'], cwd);
    if (ref) {
      // refs/remotes/origin/main → main
      return ref.replace('refs/remotes/origin/', '');
    }
  } catch {
    // No origin/HEAD configured
  }

  // Try common default branch names
  for (const name of ['main', 'master']) {
    try {
      await execGitCommand(['rev-parse', '--verify', name], cwd);
      return name;
    } catch {
      // Branch doesn't exist
    }
  }

  return null;
}

async function resolveRefHead(cwd: string, ref: string): Promise<string | null> {
  try {
    const hash = await execGitCommand(['rev-parse', '--verify', ref], cwd);
    return hash || null;
  } catch {
    return null;
  }
}
