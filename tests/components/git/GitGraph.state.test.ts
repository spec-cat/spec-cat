import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import GitGraph from '~/components/git/GitGraph.vue'

const gitStore = {
  commits: [{
    hash: 'abc',
    shortHash: 'abc',
    author: 'a',
    email: 'a@a.com',
    timestamp: 1,
    message: 'm',
    parents: [],
    branches: ['main'],
    tags: [],
    isHead: true,
  }],
  branches: [{ name: 'main', isHead: true }],
  filteredCommits: [{
    hash: 'abc',
    shortHash: 'abc',
    author: 'a',
    email: 'a@a.com',
    timestamp: 1,
    message: 'm',
    parents: [],
    branches: ['main'],
    tags: [],
    isHead: true,
  }],
  tags: [],
  localBranchNames: new Set(['main']),
  stashes: [],
  remotes: [],
  currentBranch: { name: 'main' },
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: false,
  totalCount: 1,
  searchQuery: '',
  filteredBranches: [],
  uncommittedChangesCount: 0,
  isUncommittedChangesSelected: false,
  graphStyle: 'rounded',
  muteNonAncestral: false,
  columnVisibility: { date: true, author: true, commit: true },
  selectedCommit: null,
  selectedCommitFiles: null,
  selectedCommitStats: null,
  isLoadingDetails: false,
  isComparing: false,
  comparisonCommit: null,
  comparisonFiles: null,
  comparisonStats: null,
  comparisonLoading: false,
  selectedFeatureId: null,
  featureMergeBase: null,
  detailViewPosition: 'inline',
  fileViewMode: 'list',
  activeDialog: null,
  activeContextMenu: null,
  conversationBranch: null,
  conversationMergeBase: null,
  previewBranch: null,
  previewMergeBase: null,
  searchResultHashes: [],
  searchResultIndex: 0,
  lastRefreshTime: Date.now(),
  isRefreshing: false,

  loadGitGraph: vi.fn(async () => {}),
  setPreviewBranch: vi.fn(async () => {}),
  setConversationBranch: vi.fn(async () => {}),
  reset: vi.fn(),
  setActiveContextMenu: vi.fn(),
  clearActiveContextMenu: vi.fn(),
  setActiveDialog: vi.fn(),
  clearActiveDialog: vi.fn(),

  setSearchQuery: vi.fn(),
  nextSearchResult: vi.fn(),
  prevSearchResult: vi.fn(),
  clearComparison: vi.fn(),
  clearSelection: vi.fn(),
  toggleDetailViewPosition: vi.fn(),
  fetchAll: vi.fn(async () => {}),
  addRemote: vi.fn(async () => ({ success: true })),
  editRemote: vi.fn(async () => ({ success: true })),
  deleteRemote: vi.fn(async () => ({ success: true })),
  clearFilters: vi.fn(),
  toggleBranchFilter: vi.fn(),
  selectCommit: vi.fn(async () => {}),
  loadMoreCommits: vi.fn(async () => {}),
  selectUncommittedChanges: vi.fn(),
  checkoutBranch: vi.fn(async () => ({ success: true })),
  createBranch: vi.fn(async () => ({ success: true })),
  deleteLocalBranch: vi.fn(async () => ({ success: true })),
  deleteRemoteBranch: vi.fn(async () => ({ success: true })),
  renameBranch: vi.fn(async () => ({ success: true })),
  mergeBranch: vi.fn(async () => ({ success: true })),
  rebaseBranch: vi.fn(async () => ({ success: true })),
  pushBranch: vi.fn(async () => ({ success: true })),
  pullBranch: vi.fn(async () => ({ success: true })),
  fetchBranch: vi.fn(async () => ({ success: true })),
  copyToClipboard: vi.fn(async () => {}),
  revertCommit: vi.fn(async () => ({ success: true })),
  copyCommitSubject: vi.fn(async () => ({ success: true })),
  getTagDetail: vi.fn(async () => ({ success: false })),
  pushTag: vi.fn(async () => ({ success: true })),
  applyStash: vi.fn(async () => ({ success: true })),
  popStash: vi.fn(async () => ({ success: true })),
  dropStash: vi.fn(async () => ({ success: true })),
  stashBranch: vi.fn(async () => ({ success: true })),
  stashChanges: vi.fn(async () => ({ success: true })),
  resetWorking: vi.fn(async () => ({ success: true })),
  cleanUntracked: vi.fn(async () => ({ success: true })),
  navigateToCommit: vi.fn(),
  toggleMuteNonAncestral: vi.fn(),
  setGraphStyle: vi.fn(),
  toggleColumnVisibility: vi.fn(),
}

vi.mock('~/stores/gitGraph', () => ({
  useGitGraphStore: () => gitStore,
}))

vi.mock('~/stores/chat', () => ({
  useChatStore: () => ({
    activeConversation: null,
    previewingConversation: null,
  }),
}))

const autoRefreshMock = {
  startPolling: vi.fn(),
  stopPolling: vi.fn(),
  cleanup: vi.fn(),
  startInteraction: vi.fn(),
  endInteraction: vi.fn(),
  setScrollCallbacks: vi.fn(),
}

vi.mock('~/composables/useAutoRefresh', () => ({
  useAutoRefresh: () => autoRefreshMock,
}))

vi.mock('~/composables/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => ({
    start: vi.fn(),
    stop: vi.fn(),
  }),
}))

describe('GitGraph dialog/context transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens branch context menu and activates generic dialog on checkout action', async () => {
    const wrapper = mount(GitGraph, {
      props: { workingDirectory: '/repo' },
      shallow: true,
    })

    const commitList = wrapper.findComponent({ name: 'GitCommitList' })
    commitList.vm.$emit('branchContextMenu', {
      branch: 'feature/x',
      x: 10,
      y: 20,
      isCurrentBranch: false,
      isLocal: true,
      commitHash: 'abc',
    })
    await nextTick()

    expect(gitStore.setActiveContextMenu).toHaveBeenCalledWith({
      type: 'branch',
      props: {
        branch: 'feature/x',
        x: 10,
        y: 20,
        isCurrentBranch: false,
        isLocal: true,
        commitHash: 'abc',
      },
      position: { x: 10, y: 20 },
    })

    const branchMenu = wrapper.findComponent({ name: 'GitBranchMenu' })
    branchMenu.vm.$emit('checkout')
    await nextTick()

    expect(gitStore.setActiveDialog).toHaveBeenCalledWith({ type: 'generic', props: {} })
  })
})
