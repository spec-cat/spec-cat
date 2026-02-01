import type { GitLogResponse, Branch, GitTag } from "~/types/git";
import { GRAPH_CONSTANTS } from "~/types/git";
import {
  isGitRepositorySync,
  execGit,
  getBranchesSync,
  getTags,
  getCommitCount,
  parseGitLog,
  generateBranchColor,
} from "~/server/utils/git";
import { logger } from "~/server/utils/logger";

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const workingDirectory = query.workingDirectory as string | undefined;
    const offset = parseInt(query.offset as string, 10) || 0;
    const limit = parseInt(query.limit as string, 10) || GRAPH_CONSTANTS.COMMITS_PER_PAGE;

    if (!workingDirectory) {
      throw createError({
        statusCode: 400,
        statusMessage: "workingDirectory query parameter is required",
      });
    }

    // Check if directory is a git repository (NFR-003)
    if (!isGitRepositorySync(workingDirectory)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Not a Git repository",
        data: { code: "NOT_GIT_REPO" },
      });
    }

    // Get branches and tags first (needed for decoration parsing)
    const branchNames = getBranchesSync(workingDirectory);
    const tagNames = getTags(workingDirectory);
    const totalCount = getCommitCount(workingDirectory);

    // Get HEAD commit hash
    const headHash = execGit(workingDirectory, "rev-parse HEAD").trim();

    // Get branch -> commit hash mapping (with local branch set)
    const { branchMap: branchToCommit, localBranches } = getBranchCommitMap(workingDirectory);

    // Get tag -> commit hash mapping
    const tagToCommit = getTagCommitMap(workingDirectory);

    // Get commit log with decorations
    // Format: hash|shortHash|author|email|timestamp|message|parentHashes|decorations
    const logOutput = execGit(
      workingDirectory,
      `log --all --format="%H|%h|%an|%ae|%at|%s|%P" --skip=${offset} -n ${limit}`
    );

    const commits = parseGitLog(logOutput, branchNames, tagNames);

    // Map branches and tags to commits
    const commitToBranches = new Map<string, string[]>();
    const commitToTags = new Map<string, string[]>();

    for (const [branch, hash] of branchToCommit) {
      if (!commitToBranches.has(hash)) {
        commitToBranches.set(hash, []);
      }
      commitToBranches.get(hash)!.push(branch);
    }

    for (const [tag, hash] of tagToCommit) {
      if (!commitToTags.has(hash)) {
        commitToTags.set(hash, []);
      }
      commitToTags.get(hash)!.push(tag);
    }

    // Apply decorations to commits and detect merge commits (T036)
    for (const commit of commits) {
      commit.branches = commitToBranches.get(commit.hash) || [];
      commit.tags = commitToTags.get(commit.hash) || [];
      if (commit.hash === headHash) {
        commit.isHead = true;
      }
      // Set isMerge flag for commits with 2+ parents (FR-005)
      if (commit.parents && commit.parents.length > 1) {
        commit.isMerge = true;
      }
    }

    const hasMore = offset + commits.length < totalCount;

    const headBranch = execGit(workingDirectory, "rev-parse --abbrev-ref HEAD").trim();
    const branches: Branch[] = branchNames.map((name) => ({
      name,
      ref: localBranches.has(name) ? `refs/heads/${name}` : `refs/remotes/${name}`,
      tip: branchToCommit.get(name) || '',
      ahead: 0,
      behind: 0,
      color: generateBranchColor(name),
      isHead: name === headBranch,
      isRemote: !localBranches.has(name),
      lastCommitDate: new Date(0).toISOString(),
    }));

    const tags: GitTag[] = tagNames.map((name) => ({
      name,
      hash: tagToCommit.get(name) || '',
      isAnnotated: false,
    }));

    const response: GitLogResponse = {
      commits,
      branches,
      tags,
      localBranches: Array.from(localBranches),
      hasMore,
      totalCount,
    };

    return response;
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }

    logger.api.error("Error reading git log", { error });
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to read git log",
    });
  }
});

/**
 * Get mapping of branch names to their commit hashes
 */
function getBranchCommitMap(cwd: string): { branchMap: Map<string, string>; localBranches: Set<string> } {
  const branchMap = new Map<string, string>();
  const localBranches = new Set<string>();

  try {
    // Get local and remote branches with their commit hashes
    // Use both full refname and short name to properly filter HEAD references
    const output = execGit(cwd, 'for-each-ref "--format=%(objectname) %(refname) %(refname:short)" refs/heads refs/remotes');

    for (const line of output.split("\n").filter(Boolean)) {
      const parts = line.split(" ");
      if (parts.length >= 3) {
        const hash = parts[0];
        const fullRef = parts[1];
        const shortName = parts.slice(2).join(" "); // Handle branch names with spaces
        // Skip HEAD pointer entries (e.g., refs/remotes/origin/HEAD)
        if (!fullRef.endsWith("/HEAD")) {
          branchMap.set(shortName, hash);
          // Track local branches by checking refs/heads/ prefix
          if (fullRef.startsWith("refs/heads/")) {
            localBranches.add(shortName);
          }
        }
      }
    }
  } catch (err) {
    logger.api.error("Failed to get branch commit map", { error: err });
  }

  return { branchMap, localBranches };
}

/**
 * Get mapping of tag names to their commit hashes
 */
function getTagCommitMap(cwd: string): Map<string, string> {
  const result = new Map<string, string>();

  try {
    // Get tags with their commit hashes (dereference annotated tags)
    const output = execGit(cwd, 'for-each-ref "--format=%(objectname) %(refname:short)" refs/tags');

    for (const line of output.split("\n").filter(Boolean)) {
      const spaceIndex = line.indexOf(" ");
      if (spaceIndex > 0) {
        const hash = line.substring(0, spaceIndex);
        const tag = line.substring(spaceIndex + 1);
        result.set(tag, hash);
      }
    }
  } catch (err) {
    logger.api.error("Failed to get tag commit map", { error: err });
  }

  return result;
}
