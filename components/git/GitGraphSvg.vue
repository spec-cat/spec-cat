<script setup lang="ts">
import type { GraphRowData } from "~/types/git";
import { GRAPH_CONSTANTS } from "~/types/git";

interface Props {
  rowData: GraphRowData | null;
  maxLane: number;
  highlightBranches?: string[];
  tooltipText?: string;
}

const props = withDefaults(defineProps<Props>(), {
  maxLane: 4,
});

const { COLUMN_WIDTH, ROW_HEIGHT, NODE_RADIUS, PADDING } = GRAPH_CONSTANTS;

// SVG width based on max lanes
const svgWidth = computed(() => PADDING * 2 + (props.maxLane + 1) * COLUMN_WIDTH);
const svgHeight = ROW_HEIGHT;

// Center Y of the row
const centerY = ROW_HEIGHT / 2;

/**
 * Get x position for a lane
 */
function laneX(lane: number): number {
  return PADDING + lane * COLUMN_WIDTH;
}

/**
 * Generate SVG path for a connection segment.
 * Supports both rounded (Bezier) and angular (straight-line) styles.
 */
function getSegmentPath(seg: { fromLane: number; toLane: number; type: string; style: string }): string {
  const fromX = laneX(seg.fromLane);
  const toX = laneX(seg.toLane);

  if (seg.type === 'vertical') {
    return `M ${fromX} 0 L ${toX} ${svgHeight}`;
  }

  if (seg.type === 'vertical-top') {
    // Top half only: from row top to dot center (arrival line)
    return `M ${fromX} 0 L ${fromX} ${centerY}`;
  }

  if (seg.type === 'vertical-bottom') {
    // Bottom half only: from dot center to row bottom (departure line)
    return `M ${fromX} ${centerY} L ${fromX} ${svgHeight}`;
  }

  if (seg.style === 'rounded') {
    // Smooth curve from node center downward, bending toward target lane
    const cp1x = fromX;
    const cp1y = svgHeight;
    const cp2x = toX;
    const cp2y = svgHeight;
    return `M ${fromX} ${centerY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${toX} ${svgHeight}`;
  } else {
    // Angular: straight line with midpoint corner
    const midY = svgHeight * 0.75;
    return `M ${fromX} ${centerY} L ${fromX} ${midY} L ${toX} ${svgHeight}`;
  }
}

// Compute node x position
const nodeX = computed(() => {
  if (!props.rowData) return PADDING;
  return laneX(props.rowData.lane);
});
</script>

<template>
  <svg
    :width="svgWidth"
    :height="svgHeight"
    class="block flex-shrink-0"
    aria-hidden="true"
  >
    <template v-if="rowData">
      <!-- Connection lines (drawn behind node) -->
      <path
        v-for="(seg, idx) in rowData.connections"
        :key="idx"
        :d="getSegmentPath(seg)"
        :stroke="seg.color"
        stroke-width="2"
        fill="none"
        :stroke-dasharray="seg.type.startsWith('merge') ? '4 3' : 'none'"
      />

      <!-- Commit node (FR-005: tooltip on hover) -->
      <g>
        <title v-if="tooltipText">{{ tooltipText }}</title>

        <template v-if="rowData.nodeType === 'head'">
          <!-- HEAD: highlighted ring + filled circle -->
          <circle
            :cx="nodeX"
            :cy="centerY"
            :r="NODE_RADIUS + 2"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="text-retro-cyan"
          />
          <circle
            :cx="nodeX"
            :cy="centerY"
            :r="NODE_RADIUS"
            :fill="rowData.color"
          />
        </template>

        <template v-else-if="rowData.nodeType === 'merge'">
          <!-- Merge: double circle -->
          <circle
            :cx="nodeX"
            :cy="centerY"
            :r="NODE_RADIUS + 1"
            fill="none"
            :stroke="rowData.color"
            stroke-width="1.5"
          />
          <circle
            :cx="nodeX"
            :cy="centerY"
            :r="NODE_RADIUS - 1"
            :fill="rowData.color"
          />
        </template>

        <template v-else-if="rowData.nodeType === 'stash'">
          <!-- Stash: nested circle -->
          <circle
            :cx="nodeX"
            :cy="centerY"
            :r="NODE_RADIUS"
            fill="none"
            :stroke="rowData.color"
            stroke-width="2"
          />
          <circle
            :cx="nodeX"
            :cy="centerY"
            :r="NODE_RADIUS - 2"
            :fill="rowData.color"
          />
        </template>

        <template v-else-if="rowData.nodeType === 'uncommitted'">
          <!-- Uncommitted: open circle -->
          <circle
            :cx="nodeX"
            :cy="centerY"
            :r="NODE_RADIUS"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="text-retro-yellow"
            stroke-dasharray="3 2"
          />
        </template>

        <template v-else>
          <!-- Regular: filled circle -->
          <circle
            :cx="nodeX"
            :cy="centerY"
            :r="NODE_RADIUS"
            :fill="rowData.color"
          />
        </template>
      </g>
    </template>
  </svg>
</template>
