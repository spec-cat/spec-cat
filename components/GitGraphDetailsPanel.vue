<script setup lang="ts">
import type { CommitFileTreeRow, GitCommit, GitCommitFile, GitCompareResponse, GitGraphResponse } from '~/types/app'
import { formatCommitDate } from '~/utils/app-formatters'

const props = defineProps<{
  graph: GitGraphResponse | null
  selectedUncommittedChanges: boolean
  compareView: GitCompareResponse | null
  loadingCompare: boolean
  selectedCommit: GitCommit | null
  selectedCommitFiles: GitCommitFile[]
  selectedCommitFilePath: string
  loadingCommitFiles: boolean
  commitFilesError: string
  commitFileTreeRows: CommitFileTreeRow[]
  commitFileViewMode: 'flat' | 'tree'
  gitCommitMessage: string
  gitActionRunning: boolean
}>()
const emit = defineEmits<{
  'update:commitFileViewMode': [value: 'flat' | 'tree']
  'update:gitCommitMessage': [value: string]
  unstageFiles: [files?: string[]]
  stageFiles: [files?: string[]]
  commitStagedChanges: []
  closeCompareView: []
  refreshSelectedCommitFiles: []
  toggleCommitFileViewMode: []
  toggleFileFolder: [path: string]
  openDiffPreview: [file: GitCommitFile]
}>()
const gitGraph = computed(() => props.graph)
const selectedUncommittedChanges = computed(() => props.selectedUncommittedChanges)
const compareView = computed(() => props.compareView)
const loadingCompare = computed(() => props.loadingCompare)
const selectedCommit = computed(() => props.selectedCommit)
const selectedCommitFiles = computed(() => props.selectedCommitFiles)
const selectedCommitFilePath = computed(() => props.selectedCommitFilePath)
const loadingCommitFiles = computed(() => props.loadingCommitFiles)
const commitFilesError = computed(() => props.commitFilesError)
const commitFileTreeRows = computed(() => props.commitFileTreeRows)
const commitFileViewMode = computed({ get: () => props.commitFileViewMode, set: value => emit('update:commitFileViewMode', value) })
const gitCommitMessage = computed({ get: () => props.gitCommitMessage, set: value => emit('update:gitCommitMessage', value) })
const gitActionRunning = computed(() => props.gitActionRunning)
const unstageFiles = (files?: string[]) => emit('unstageFiles', files)
const stageFiles = (files?: string[]) => emit('stageFiles', files)
const commitStagedChanges = () => emit('commitStagedChanges')
const closeCompareView = () => emit('closeCompareView')
const refreshSelectedCommitFiles = () => emit('refreshSelectedCommitFiles')
const toggleCommitFileViewMode = () => emit('toggleCommitFileViewMode')
const toggleFileFolder = (path: string) => emit('toggleFileFolder', path)
const openDiffPreview = (file: GitCommitFile) => emit('openDiffPreview', file)
</script>

<template>
  <section class="grid min-h-0 grid-rows-[32px_minmax(0,1fr)] overflow-hidden border-t border-black/30 bg-[var(--rg-editor-group)]">
    <div class="flex h-8 items-center border-b border-[#46443f] px-3 text-[11px] font-bold uppercase text-[#ede0ce]">
      {{ selectedUncommittedChanges ? 'Uncommitted Changes' : compareView || loadingCompare ? 'Commit Comparison' : 'Commit Details' }}
    </div>
    <div class="min-h-0 overflow-hidden p-3 font-mono text-[11px] leading-5 text-[#c8bdaf]">
      <template v-if="selectedUncommittedChanges && gitGraph">
        <div class="grid h-full grid-cols-[minmax(0,1fr)_220px] gap-3">
          <div class="min-h-0 overflow-auto">
            <div class="mb-1 flex items-center justify-between text-[#bcd42a]">
              <span>Staged ({{ gitGraph.status.stagedFiles.length }})</span>
              <button
                v-if="gitGraph.status.stagedFiles.length"
                type="button"
                class="text-[10px] text-[var(--rg-muted)] hover:text-[var(--rg-foreground)]"
                @click="unstageFiles()"
              >
                Unstage All
              </button>
            </div>
            <button
              v-for="file in gitGraph.status.stagedFiles"
              :key="`staged-${file.path}`"
              type="button"
              class="flex w-full items-center gap-2 truncate py-0.5 text-left hover:bg-black/10"
              :title="`Unstage ${file.path}`"
              @click="unstageFiles([file.path])"
            >
              <span class="w-3 text-[#bcd42a]">{{ file.status }}</span>
              <span class="truncate">{{ file.oldPath ? `${file.oldPath} → ${file.path}` : file.path }}</span>
            </button>

            <div class="mb-1 mt-2 flex items-center justify-between text-[#f7b83d]">
              <span>Unstaged ({{ gitGraph.status.unstagedFiles.length }})</span>
              <button
                v-if="gitGraph.status.unstagedFiles.length"
                type="button"
                class="text-[10px] text-[var(--rg-muted)] hover:text-[var(--rg-foreground)]"
                @click="stageFiles()"
              >
                Stage All
              </button>
            </div>
            <button
              v-for="file in gitGraph.status.unstagedFiles"
              :key="`unstaged-${file.path}`"
              type="button"
              class="flex w-full items-center gap-2 truncate py-0.5 text-left hover:bg-black/10"
              :title="`Stage ${file.path}`"
              @click="stageFiles([file.path])"
            >
              <span class="w-3 text-[#f7b83d]">{{ file.status }}</span>
              <span class="truncate">{{ file.oldPath ? `${file.oldPath} → ${file.path}` : file.path }}</span>
            </button>
          </div>
          <div class="flex min-h-0 flex-col gap-2 border-l border-[var(--rg-border)] pl-3">
            <textarea
              v-model="gitCommitMessage"
              rows="3"
              class="min-h-0 flex-1 resize-none border border-[var(--rg-border)] bg-[var(--rg-input)] p-2 text-[11px] text-[var(--rg-foreground)] outline-none focus:border-[var(--rg-accent)]"
              placeholder="Commit message..."
              @keydown.ctrl.enter="commitStagedChanges"
              @keydown.meta.enter="commitStagedChanges"
            />
            <button
              type="button"
              class="h-7 bg-[var(--rg-accent)] px-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="!gitCommitMessage.trim() || !gitGraph.status.stagedFiles.length || gitActionRunning"
              @click="commitStagedChanges"
            >
              {{ gitActionRunning ? 'Working...' : `Commit (${gitGraph.status.stagedFiles.length})` }}
            </button>
          </div>
        </div>
      </template>
      <template v-else-if="compareView || loadingCompare">
        <p v-if="loadingCompare" class="text-[#88857c]">Comparing commits...</p>
        <div v-else-if="compareView" class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
          <div class="min-h-0">
            <div class="mb-2 flex min-w-0 items-center justify-between gap-2">
              <span class="min-w-0 truncate text-[var(--rg-accent)]">
                {{ compareView.from.slice(0, 8) }} → {{ compareView.to.slice(0, 8) }}
              </span>
              <button
                type="button"
                class="shrink-0 text-[10px] text-[var(--rg-muted)] hover:text-[var(--rg-foreground)]"
                @click="closeCompareView"
              >
                Close
              </button>
            </div>
            <div class="mb-2 flex gap-4 text-[11px]">
              <span>{{ compareView.stats.filesChanged }} files</span>
              <span class="text-[#bcd42a]">+{{ compareView.stats.additions }}</span>
              <span class="text-[#f03e5f]">−{{ compareView.stats.deletions }}</span>
            </div>
          </div>
          <div class="min-h-0 overflow-auto border-t border-black/30 pt-2">
            <div
              v-for="file in compareView.files"
              :key="`${file.status}-${file.oldPath || ''}-${file.path}`"
              class="grid w-full grid-cols-[22px_minmax(0,1fr)_auto] gap-2 py-0.5 text-left"
              :title="file.oldPath ? `${file.oldPath} → ${file.path}` : file.path"
            >
              <span
                class="text-center font-bold"
                :class="file.status === 'A' ? 'text-[#59d9d9]' : file.status === 'D' ? 'text-[#f03e5f]' : file.status === 'R' ? 'text-[#f7b83d]' : 'text-[#bcd42a]'"
              >
                {{ file.status }}
              </span>
              <span class="truncate">{{ file.oldPath ? `${file.oldPath} → ${file.path}` : file.path }}</span>
              <span class="shrink-0 font-mono text-[10px]">
                <span class="text-[#bcd42a]">+{{ file.additions }}</span>
                <span class="ml-1 text-[#f03e5f]">−{{ file.deletions }}</span>
              </span>
            </div>
            <p v-if="!compareView.files.length" class="py-1 text-[#88857c]">No differences.</p>
          </div>
        </div>
      </template>
      <template v-else-if="selectedCommit">
        <div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
          <div class="min-h-0">
            <div class="mb-2 truncate text-[var(--rg-accent)]">{{ selectedCommit.subject }}</div>
            <div class="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1">
              <span class="text-[#88857c]">hash</span>
              <span class="truncate" :title="selectedCommit.hash">{{ selectedCommit.hash }}</span>
              <span class="text-[#88857c]">author</span>
              <span class="truncate" :title="selectedCommit.author.email">{{ selectedCommit.author.name }}</span>
              <span class="text-[#88857c]">date</span>
              <span>{{ formatCommitDate(selectedCommit.date) }}</span>
              <span class="text-[#88857c]">parents</span>
              <span>{{ selectedCommit.parents.length || 0 }}</span>
            </div>
          </div>
          <div class="mt-3 grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-t border-black/30 pt-2">
            <div class="mb-1 flex items-center justify-between text-[#ede0ce]">
              <span>Files ({{ selectedCommitFiles.length }})</span>
              <span class="flex items-center gap-2">
                <button
                  type="button"
                  class="text-[10px] hover:text-[var(--rg-foreground)]"
                  :class="commitFileViewMode === 'flat' ? 'text-[var(--rg-accent)]' : 'text-[var(--rg-muted)]'"
                  title="Show files as a flat list"
                  @click="commitFileViewMode = 'flat'"
                >
                  Flat
                </button>
                <button
                  type="button"
                  class="text-[10px] hover:text-[var(--rg-foreground)]"
                  :class="commitFileViewMode === 'tree' ? 'text-[var(--rg-accent)]' : 'text-[var(--rg-muted)]'"
                  title="Show files as a directory tree"
                  @click="commitFileViewMode === 'flat' ? toggleCommitFileViewMode() : undefined"
                >
                  Tree
                </button>
                <button
                  type="button"
                  class="text-[10px] text-[var(--rg-muted)] hover:text-[var(--rg-foreground)]"
                  @click="refreshSelectedCommitFiles"
                >
                  Refresh
                </button>
              </span>
            </div>
            <p v-if="loadingCommitFiles" class="min-h-0 overflow-auto py-1 text-[#88857c]">Loading files...</p>
            <p v-else-if="commitFilesError" class="min-h-0 overflow-auto py-1 text-[#f03e5f]">{{ commitFilesError }}</p>
            <p v-else-if="!selectedCommitFiles.length" class="min-h-0 overflow-auto py-1 text-[#88857c]">No file changes.</p>
            <div v-else-if="commitFileViewMode === 'flat'" class="h-full min-h-0 overflow-auto pr-1">
              <button
                v-for="file in selectedCommitFiles"
                :key="`${file.status}-${file.oldPath || ''}-${file.path}`"
                type="button"
                class="grid w-full grid-cols-[22px_minmax(0,1fr)] gap-2 py-0.5 text-left hover:bg-black/10"
                :class="selectedCommitFilePath === file.path ? 'bg-black/20 text-[var(--rg-accent)]' : ''"
                :title="file.oldPath ? `${file.oldPath} → ${file.path}` : file.path"
                @click="openDiffPreview(file)"
              >
                <span
                  class="text-center font-bold"
                  :class="file.status === 'A' ? 'text-[#59d9d9]' : file.status === 'D' ? 'text-[#f03e5f]' : file.status === 'R' ? 'text-[#f7b83d]' : 'text-[#bcd42a]'"
                >
                  {{ file.status }}
                </span>
                <span class="truncate">{{ file.oldPath ? `${file.oldPath} → ${file.path}` : file.path }}</span>
              </button>
            </div>
            <div v-else class="h-full min-h-0 overflow-auto pr-1">
              <template v-for="row in commitFileTreeRows">
                <button
                  v-if="row.kind === 'folder'"
                  :key="`folder-${row.path}`"
                  type="button"
                  class="grid w-full grid-cols-[22px_minmax(0,1fr)] gap-2 py-0.5 text-left hover:bg-black/10"
                  :style="{ paddingLeft: `${row.depth * 12}px` }"
                  :title="row.path"
                  @click="toggleFileFolder(row.path)"
                >
                  <span class="text-center text-[var(--rg-accent)]">{{ row.expanded ? '▾' : '▸' }}</span>
                  <span class="truncate text-[#a0988e]">{{ row.name }}/</span>
                </button>
                <button
                  v-else
                  :key="`file-${row.file.status}-${row.file.oldPath || ''}-${row.file.path}`"
                  type="button"
                  class="grid w-full grid-cols-[22px_minmax(0,1fr)] gap-2 py-0.5 text-left hover:bg-black/10"
                  :class="selectedCommitFilePath === row.file.path ? 'bg-black/20 text-[var(--rg-accent)]' : ''"
                  :style="{ paddingLeft: `${row.depth * 12}px` }"
                  :title="row.file.oldPath ? `${row.file.oldPath} → ${row.file.path}` : row.file.path"
                  @click="openDiffPreview(row.file)"
                >
                  <span
                    class="text-center font-bold"
                    :class="row.file.status === 'A' ? 'text-[#59d9d9]' : row.file.status === 'D' ? 'text-[#f03e5f]' : row.file.status === 'R' ? 'text-[#f7b83d]' : 'text-[#bcd42a]'"
                  >
                    {{ row.file.status }}
                  </span>
                  <span class="truncate">{{ row.name }}</span>
                </button>
              </template>
            </div>
          </div>
        </div>
      </template>
      <p v-else class="text-[#88857c]">Select a commit.</p>
    </div>
  </section>
</template>
