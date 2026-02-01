<script setup lang="ts">
/**
 * GitContextMenu - A shared reusable context menu component (FR-023)
 *
 * Features:
 * - Data-driven menu items with icons, separators, disabled/danger states
 * - Click-outside-to-close behavior
 * - Keyboard navigation (Arrow keys, Enter, Escape)
 * - Viewport boundary detection
 * - Teleported to body to avoid z-index / overflow issues
 * - Retro-terminal dark theme
 */

export interface MenuItem {
  key: string;
  label: string;
  icon?: any; // heroicon component
  separator?: boolean; // renders a divider before this item
  disabled?: boolean;
  danger?: boolean; // red text for destructive actions
}

interface Props {
  items: MenuItem[];
  x: number;
  y: number;
  title?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'action', actionKey: string): void;
}>();

const menuRef = ref<HTMLElement | null>(null);

// Track the currently focused item index for keyboard navigation
// -1 means no item is focused
const focusedIndex = ref(-1);

// Filter to only actionable (non-disabled) items for keyboard navigation
const actionableIndices = computed(() =>
  props.items
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => !item.disabled)
    .map(({ i }) => i)
);

// --- Click-outside handling ---

let active = false;

function handleClickOutside(event: MouseEvent) {
  if (!active) return;
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    emit('close');
  }
}

onMounted(() => {
  // Delay activation to avoid closing on the same event that triggered the menu
  requestAnimationFrame(() => {
    active = true;
  });

  document.addEventListener('mousedown', handleClickOutside);
  document.addEventListener('contextmenu', handleClickOutside);

  // Focus the menu container so keyboard events work immediately
  nextTick(() => {
    menuRef.value?.focus();
  });
});

onUnmounted(() => {
  active = false;
  document.removeEventListener('mousedown', handleClickOutside);
  document.removeEventListener('contextmenu', handleClickOutside);
});

// --- Keyboard navigation ---

function moveFocus(direction: 1 | -1) {
  const indices = actionableIndices.value;
  if (indices.length === 0) return;

  if (focusedIndex.value === -1) {
    // Nothing focused yet — pick first or last depending on direction
    focusedIndex.value = direction === 1 ? indices[0] : indices[indices.length - 1];
    return;
  }

  const currentPos = indices.indexOf(focusedIndex.value);
  if (currentPos === -1) {
    // Current index not in actionable list, reset
    focusedIndex.value = direction === 1 ? indices[0] : indices[indices.length - 1];
    return;
  }

  const nextPos = currentPos + direction;
  if (nextPos >= 0 && nextPos < indices.length) {
    focusedIndex.value = indices[nextPos];
  }
  // At boundaries, do nothing (don't wrap)
}

function handleKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'Escape':
      event.preventDefault();
      emit('close');
      break;
    case 'ArrowDown':
      event.preventDefault();
      moveFocus(1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      moveFocus(-1);
      break;
    case 'Enter': {
      event.preventDefault();
      const item = props.items[focusedIndex.value];
      if (item && !item.disabled) {
        emit('action', item.key);
        emit('close');
      }
      break;
    }
  }
}

function handleItemClick(item: MenuItem) {
  if (item.disabled) return;
  emit('action', item.key);
  emit('close');
}

// --- Viewport boundary detection ---

const menuStyle = computed(() => {
  const menuWidth = 220;
  // Estimate height: title header ~28px + border 1px, each item ~36px, separators ~9px
  const titleHeight = props.title ? 29 : 0;
  const separatorCount = props.items.filter((item) => item.separator).length;
  const itemsHeight = props.items.length * 36 + separatorCount * 9 + 8; // 8 for py-1
  const menuHeight = titleHeight + itemsHeight;
  const padding = 8;

  let left = props.x;
  let top = props.y;

  if (typeof window !== 'undefined') {
    // Adjust if menu would overflow right edge
    if (left + menuWidth > window.innerWidth - padding) {
      left = window.innerWidth - menuWidth - padding;
    }
    // Adjust if menu would overflow left edge
    if (left < padding) {
      left = padding;
    }
    // Adjust if menu would overflow bottom edge
    if (top + menuHeight > window.innerHeight - padding) {
      top = window.innerHeight - menuHeight - padding;
    }
    // Adjust if menu would overflow top edge
    if (top < padding) {
      top = padding;
    }
  }

  return {
    left: `${left}px`,
    top: `${top}px`,
  };
});
</script>

<template>
  <Teleport to="body">
    <div
      ref="menuRef"
      class="fixed z-50 bg-retro-panel border border-retro-border rounded shadow-lg py-1 min-w-[220px]"
      :style="menuStyle"
      role="menu"
      :aria-label="title ?? 'Context menu'"
      tabindex="-1"
      @keydown="handleKeydown"
    >
      <!-- Optional title header -->
      <div
        v-if="title"
        class="px-3 py-1 text-xs text-retro-muted border-b border-retro-border truncate font-mono"
      >
        {{ title }}
      </div>

      <!-- Menu items -->
      <template v-for="(item, index) in items" :key="item.key">
        <!-- Separator -->
        <div
          v-if="item.separator"
          class="my-1 border-t border-retro-border"
          role="separator"
        />

        <!-- Menu item button -->
        <button
          class="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors focus:outline-none"
          :class="[
            item.disabled
              ? 'text-retro-muted/50 cursor-not-allowed'
              : item.danger
                ? [
                    'text-retro-red hover:bg-retro-red/10 focus:bg-retro-red/10',
                    focusedIndex === index ? 'bg-retro-red/10' : '',
                  ]
                : [
                    'text-retro-text hover:bg-retro-cyan/10 focus:bg-retro-cyan/10',
                    focusedIndex === index ? 'bg-retro-cyan/10' : '',
                  ],
          ]"
          role="menuitem"
          :aria-disabled="item.disabled || undefined"
          :tabindex="-1"
          @click="handleItemClick(item)"
          @mouseenter="focusedIndex = item.disabled ? focusedIndex : index"
          @mouseleave="focusedIndex = -1"
        >
          <component
            :is="item.icon"
            v-if="item.icon"
            class="w-4 h-4 flex-shrink-0"
            :class="item.disabled ? 'opacity-50' : item.danger ? '' : 'text-retro-muted'"
          />
          <!-- Spacer when no icon to keep labels aligned -->
          <span v-else class="w-4 h-4 flex-shrink-0" />
          {{ item.label }}
        </button>
      </template>
    </div>
  </Teleport>
</template>
