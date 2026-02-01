import type { GitLogCommit, GraphRowData } from "~/types/git";
import { GRAPH_CONSTANTS, BRANCH_COLORS } from "~/types/git";

/**
 * Composable for Git graph layout computation.
 * Implements lane-based algorithm for branch visualization.
 * Outputs SVG-per-row GraphRowData for inline SVG rendering (FR-001, FR-002).
 */
export function useGitGraph() {
  const { COLUMN_WIDTH, ROW_HEIGHT, NODE_RADIUS, PADDING } = GRAPH_CONSTANTS;

  /**
   * Hash a string to get a consistent index.
   */
  function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Get color for a branch name (deterministic).
   */
  function getBranchColor(branchName: string): string {
    const index = hashString(branchName) % BRANCH_COLORS.length;
    return BRANCH_COLORS[index];
  }

  /**
   * Compute SVG-per-row graph data for commits.
   * Returns a Map of commitHash → GraphRowData for inline SVG rendering.
   * Supports both 'rounded' (Bezier) and 'angular' (straight-line) styles (FR-002).
   */
  function computeGraphRows(commits: GitLogCommit[], graphStyle: 'rounded' | 'angular' = 'rounded'): Map<string, GraphRowData> {
    const result = new Map<string, GraphRowData>();
    if (commits.length === 0) return result;

    // Step 1: Build mainline set by following first-parent chain from HEAD
    const mainlineSet = new Set<string>();
    const commitMap = new Map<string, GitLogCommit>();

    for (const commit of commits) {
      commitMap.set(commit.hash, commit);
    }

    const headCommit = commits.find((c) => c.isHead) || commits[0];
    if (headCommit) {
      let current: GitLogCommit | undefined = headCommit;
      while (current) {
        mainlineSet.add(current.hash);
        const firstParentHash: string | undefined = current.parents?.[0];
        current = firstParentHash ? commitMap.get(firstParentHash) : undefined;
      }
    }

    // Step 2: Assign lanes to commits
    const commitLanes = new Map<string, number>();
    const commitColors = new Map<string, string>();
    const activeLanes = new Map<number, string>();
    const pendingParents = new Map<string, { lane: number; color: string; childHash: string }>();
    const commitIndices = new Map<string, number>();

    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      commitIndices.set(commit.hash, i);
      const isMainline = mainlineSet.has(commit.hash);
      let lane: number;
      let color: string;

      if (pendingParents.has(commit.hash)) {
        const pending = pendingParents.get(commit.hash)!;
        lane = pending.lane;
        color = pending.color;
        pendingParents.delete(commit.hash);
      } else if (isMainline) {
        lane = 0;
        color = BRANCH_COLORS[0];
      } else {
        lane = 1;
        while (activeLanes.has(lane)) {
          lane++;
        }
        color = getBranchColor(commit.hash.substring(0, 7));
      }

      commitLanes.set(commit.hash, lane);
      commitColors.set(commit.hash, color);
      activeLanes.set(lane, commit.hash);

      // Determine node type
      const isMerge = commit.isMerge || (commit.parents && commit.parents.length > 1);
      let nodeType: GraphRowData['nodeType'] = 'regular';
      if (commit.isHead) nodeType = 'head';
      else if (isMerge) nodeType = 'merge';

      result.set(commit.hash, {
        commitHash: commit.hash,
        lane,
        color,
        nodeType,
        isMainline: mainlineSet.has(commit.hash),
        connections: [],
      });

      // Register expectations for parents
      const parentHashes = commit.parents || [];
      for (let j = 0; j < parentHashes.length; j++) {
        const parentHash = parentHashes[j];
        if (commitLanes.has(parentHash) || pendingParents.has(parentHash)) continue;

        const parentIsMainline = mainlineSet.has(parentHash);
        let parentLane: number;
        let parentColor: string;

        if (j === 0) {
          parentLane = lane;
          parentColor = color;
        } else {
          if (parentIsMainline) {
            parentLane = 0;
            parentColor = BRANCH_COLORS[0];
          } else {
            parentLane = 1;
            while (activeLanes.has(parentLane) || parentLane === lane) {
              parentLane++;
            }
            parentColor = getBranchColor(parentHash.substring(0, 7));
          }
        }

        pendingParents.set(parentHash, { lane: parentLane, color: parentColor, childHash: commit.hash });
      }

      // Free lane if this commit's branch line terminates here
      const firstParentHash = parentHashes[0];
      if (!firstParentHash) {
        // Root commit — no parents, free the lane
        activeLanes.delete(lane);
      } else {
        // Check where the first parent will be placed
        const firstParentExistingLane = commitLanes.get(firstParentHash);
        const firstParentPending = pendingParents.get(firstParentHash);
        const firstParentLane = firstParentExistingLane ?? firstParentPending?.lane;

        if (firstParentLane !== undefined && firstParentLane !== lane) {
          // First parent is on a different lane — this branch merges into it, free our lane
          activeLanes.delete(lane);
        }
      }
    }

    // Step 3: Build connections as GraphSegments per row
    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      const rowData = result.get(commit.hash);
      if (!rowData) continue;

      const parentHashes = commit.parents || [];
      for (let j = 0; j < parentHashes.length; j++) {
        const parentHash = parentHashes[j];
        const parentLane = commitLanes.get(parentHash);
        const parentIndex = commitIndices.get(parentHash);

        if (parentLane === undefined) continue;

        const fromLane = rowData.lane;
        const toLane = parentLane;
        const connectionColor = j === 0
          ? rowData.color
          : (commitColors.get(parentHash) || getBranchColor(parentHash.substring(0, 7)));

        if (fromLane === toLane) {
          // Same lane: split into bottom-half (depart from dot) on this row
          rowData.connections.push({
            type: 'vertical-bottom',
            fromLane,
            toLane,
            color: connectionColor,
            style: graphStyle,
          });
        } else if (j > 0) {
          // Merge: curve from this dot toward parent lane
          rowData.connections.push({
            type: fromLane < toLane ? 'merge-out' : 'merge-in',
            fromLane,
            toLane,
            color: connectionColor,
            style: graphStyle,
          });
        } else {
          // Branch: curve from this dot toward parent lane
          rowData.connections.push({
            type: fromLane < toLane ? 'branch-out' : 'branch-in',
            fromLane,
            toLane,
            color: connectionColor,
            style: graphStyle,
          });
        }

        // For multi-row connections, add pass-through vertical segments
        // to intermediate rows (full height, no dot on this lane)
        if (parentIndex !== undefined && parentIndex > i + 1) {
          for (let r = i + 1; r < parentIndex; r++) {
            const intermediateCommit = commits[r];
            const intermediateRow = result.get(intermediateCommit.hash);
            if (intermediateRow) {
              intermediateRow.connections.push({
                type: 'vertical',
                fromLane: toLane,
                toLane: toLane,
                color: connectionColor,
                style: graphStyle,
              });
            }
          }
        }

        // Add top-half vertical on the parent row (arrives at the parent dot)
        if (parentIndex !== undefined) {
          const parentRow = result.get(parentHash);
          if (parentRow) {
            parentRow.connections.push({
              type: 'vertical-top',
              fromLane: toLane,
              toLane: toLane,
              color: connectionColor,
              style: graphStyle,
            });
          }
        }
      }
    }

    return result;
  }

  /**
   * Compute the max lane used across all graph row data.
   */
  function computeMaxLane(graphRows: Map<string, GraphRowData>): number {
    let max = 0;
    for (const row of graphRows.values()) {
      if (row.lane > max) max = row.lane;
      for (const seg of row.connections) {
        if (seg.fromLane > max) max = seg.fromLane;
        if (seg.toLane > max) max = seg.toLane;
      }
    }
    return max;
  }

  return {
    computeGraphRows,
    computeMaxLane,
    getBranchColor,
    COLUMN_WIDTH,
    ROW_HEIGHT,
    NODE_RADIUS,
    PADDING,
  };
}
