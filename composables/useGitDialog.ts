import type { GitDialogField, GitDialogState } from '~/types/app'

export function useGitDialog() {
  const gitDialog = ref<GitDialogState | null>(null)

  function openGitDialog(options: {
    title: string
    message?: string
    danger?: boolean
    confirmLabel?: string
    fields?: GitDialogField[]
  }) {
    gitDialog.value?.resolve(null)
    return new Promise<Record<string, string | boolean> | null>((resolve) => {
      gitDialog.value = {
        title: options.title,
        message: options.message || '',
        danger: Boolean(options.danger),
        confirmLabel: options.confirmLabel || 'OK',
        fields: options.fields || [],
        resolve
      }
    })
  }

  function confirmGitDialog() {
    const dialog = gitDialog.value
    if (!dialog) return
    const result: Record<string, string | boolean> = {}
    for (const field of dialog.fields) {
      result[field.key] = field.kind === 'checkbox' ? field.value : field.value.trim()
    }
    gitDialog.value = null
    dialog.resolve(result)
  }

  function cancelGitDialog() {
    const dialog = gitDialog.value
    if (!dialog) return
    gitDialog.value = null
    dialog.resolve(null)
  }

  return { gitDialog, openGitDialog, confirmGitDialog, cancelGitDialog }
}
