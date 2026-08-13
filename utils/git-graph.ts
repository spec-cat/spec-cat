import type { GitCommit, GitDiffLine, GraphRowData, GraphSegment } from '~/types/app'

export const GRAPH_COLUMN_WIDTH = 20
export const GRAPH_ROW_HEIGHT = 32
export const GRAPH_NODE_RADIUS = 4
export const GRAPH_PADDING = 10

const GRAPH_COLORS = [
  '#3B82F6',
  '#EF4444',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
  '#06B6D4',
  '#84CC16',
  '#F43F5E',
  '#A855F7'
]

export function computeGraphRows(commits: GitCommit[], headHash: string, style: 'rounded' | 'angular' = 'rounded') {
  const result = new Map<string, GraphRowData>()
  if (!commits.length) return result

  const commitMap = new Map<string, GitCommit>()
  const mainlineSet = new Set<string>()
  for (const commit of commits) {
    commitMap.set(commit.hash, commit)
  }

  let current: GitCommit | undefined = commits[0]
  while (current) {
    mainlineSet.add(current.hash)
    current = current.parents[0] ? commitMap.get(current.parents[0]) : undefined
  }

  const commitLanes = new Map<string, number>()
  const commitColors = new Map<string, string>()
  const activeLanes = new Map<number, string>()
  const pendingParents = new Map<string, { lane: number; color: string }>()
  const commitIndices = new Map<string, number>()

  for (let index = 0; index < commits.length; index += 1) {
    const commit = commits[index]
    if (!commit) continue
    commitIndices.set(commit.hash, index)

    let lane = 0
    let color = GRAPH_COLORS[0]!
    const pending = pendingParents.get(commit.hash)

    if (pending) {
      lane = pending.lane
      color = pending.color
      pendingParents.delete(commit.hash)
    } else if (mainlineSet.has(commit.hash)) {
      lane = 0
      color = GRAPH_COLORS[0]!
    } else {
      lane = 1
      while (activeLanes.has(lane)) lane += 1
      color = getGraphColor(commit.hash)
    }

    commitLanes.set(commit.hash, lane)
    commitColors.set(commit.hash, color)
    activeLanes.set(lane, commit.hash)

    result.set(commit.hash, {
      commitHash: commit.hash,
      lane,
      color,
      nodeType: commit.hash === headHash ? 'head' : commit.parents.length > 1 ? 'merge' : 'regular',
      isMainline: mainlineSet.has(commit.hash),
      connections: []
    })

    for (let parentIndex = 0; parentIndex < commit.parents.length; parentIndex += 1) {
      const parentHash = commit.parents[parentIndex]
      if (!parentHash) continue
      if (commitLanes.has(parentHash) || pendingParents.has(parentHash)) continue

      let parentLane = lane
      let parentColor = color
      if (parentIndex > 0) {
        if (mainlineSet.has(parentHash)) {
          parentLane = 0
          parentColor = GRAPH_COLORS[0]!
        } else {
          parentLane = 1
          while (activeLanes.has(parentLane) || parentLane === lane) parentLane += 1
          parentColor = getGraphColor(parentHash)
        }
      }

      pendingParents.set(parentHash, { lane: parentLane, color: parentColor })
    }

    const firstParentHash = commit.parents[0]
    const firstParentLane = firstParentHash
      ? commitLanes.get(firstParentHash) ?? pendingParents.get(firstParentHash)?.lane
      : undefined
    if (!firstParentHash || (firstParentLane !== undefined && firstParentLane !== lane)) {
      activeLanes.delete(lane)
    }
  }

  for (let index = 0; index < commits.length; index += 1) {
    const commit = commits[index]
    if (!commit) continue
    const row = result.get(commit.hash)
    if (!row) continue

    for (let parentIndex = 0; parentIndex < commit.parents.length; parentIndex += 1) {
      const parentHash = commit.parents[parentIndex]
      if (!parentHash) continue
      const parentLane = commitLanes.get(parentHash)
      const parentRowIndex = commitIndices.get(parentHash)
      if (parentLane === undefined) continue

      const color = parentIndex === 0
        ? row.color
        : commitColors.get(parentHash) || getGraphColor(parentHash)

      if (row.lane === parentLane) {
        row.connections.push({ type: 'vertical-bottom', fromLane: row.lane, toLane: parentLane, color, style })
      } else if (parentIndex > 0) {
        row.connections.push({
          type: row.lane < parentLane ? 'merge-out' : 'merge-in',
          fromLane: row.lane,
          toLane: parentLane,
          color,
          style
        })
      } else {
        row.connections.push({
          type: row.lane < parentLane ? 'branch-out' : 'branch-in',
          fromLane: row.lane,
          toLane: parentLane,
          color,
          style
        })
      }

      if (parentRowIndex !== undefined && parentRowIndex > index + 1) {
        for (let rowIndex = index + 1; rowIndex < parentRowIndex; rowIndex += 1) {
          const intermediateCommit = commits[rowIndex]
          if (!intermediateCommit) continue
          const intermediateRow = result.get(intermediateCommit.hash)
          intermediateRow?.connections.push({
            type: 'vertical',
            fromLane: parentLane,
            toLane: parentLane,
            color,
            style
          })
        }
      }

      const parentRow = result.get(parentHash)
      parentRow?.connections.push({
        type: 'vertical-top',
        fromLane: parentLane,
        toLane: parentLane,
        color,
        style
      })
    }
  }

  return result
}

function getGraphColor(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index)
    hash |= 0
  }
  return GRAPH_COLORS[Math.abs(hash) % GRAPH_COLORS.length]!
}

export function graphLaneX(lane: number) {
  return GRAPH_PADDING + lane * GRAPH_COLUMN_WIDTH
}

export function graphSegmentPath(segment: GraphSegment) {
  const fromX = graphLaneX(segment.fromLane)
  const toX = graphLaneX(segment.toLane)
  const centerY = GRAPH_ROW_HEIGHT / 2

  if (segment.type === 'vertical') return `M ${fromX} 0 L ${toX} ${GRAPH_ROW_HEIGHT}`
  if (segment.type === 'vertical-top') return `M ${fromX} 0 L ${fromX} ${centerY}`
  if (segment.type === 'vertical-bottom') return `M ${fromX} ${centerY} L ${fromX} ${GRAPH_ROW_HEIGHT}`

  if (segment.style === 'rounded') {
    return `M ${fromX} ${centerY} C ${fromX} ${GRAPH_ROW_HEIGHT}, ${toX} ${GRAPH_ROW_HEIGHT}, ${toX} ${GRAPH_ROW_HEIGHT}`
  }

  const midY = GRAPH_ROW_HEIGHT * 0.75
  return `M ${fromX} ${centerY} L ${fromX} ${midY} L ${toX} ${GRAPH_ROW_HEIGHT}`
}

export function parseUnifiedDiff(diff: string): GitDiffLine[] {
  const lines: GitDiffLine[] = []
  let oldLine = 0
  let newLine = 0

  diff.split('\n').forEach((content, index) => {
    const hunk = content.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/)
    if (hunk) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      lines.push({ key: `${index}-hunk`, oldLine: null, newLine: null, content, kind: 'hunk' })
      return
    }

    if (content.startsWith('diff --git') || content.startsWith('index ') || content.startsWith('--- ') || content.startsWith('+++ ')) {
      lines.push({ key: `${index}-header`, oldLine: null, newLine: null, content, kind: 'header' })
      return
    }

    if (content.startsWith('+')) {
      lines.push({ key: `${index}-add`, oldLine: null, newLine, content, kind: 'add' })
      newLine += 1
      return
    }

    if (content.startsWith('-')) {
      lines.push({ key: `${index}-remove`, oldLine, newLine: null, content, kind: 'remove' })
      oldLine += 1
      return
    }

    lines.push({ key: `${index}-context`, oldLine, newLine, content, kind: 'context' })
    oldLine += 1
    newLine += 1
  })

  return lines
}

export function diffLineClass(line: GitDiffLine) {
  if (line.kind === 'add') return 'bg-[#12382f] text-[#b7f7d0]'
  if (line.kind === 'remove') return 'bg-[#3b1820] text-[#ffb4c4]'
  if (line.kind === 'hunk') return 'bg-[#223447] text-[#8fb8ff]'
  if (line.kind === 'header') return 'bg-[#24231f] text-[#f7b83d]'
  return 'text-[#d6cbbb]'
}
