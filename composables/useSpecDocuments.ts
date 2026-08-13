import type { SkillInfo, SpecFeature, SpecFile, ToastType, TraceabilityInfo } from '~/types/app'
import { extractFetchError } from '~/utils/fetch-error'

type PushToast = (type: ToastType, message: string, duration?: number) => void

export function useSpecDocuments(pushToast: PushToast) {
  const features = ref<SpecFeature[]>([])
  const loadingFeatures = ref(false)
  const specSearchQuery = ref('')
  const specViewerFeatureId = ref('')
  const selectedSpecFile = ref<{ featureId: string; filename: string; label: string } | null>(null)
  const selectedSpecContent = ref('')
  const loadingSpecContent = ref(false)
  const renderedSpecHtml = ref('')
  const showSpecEditModal = ref(false)
  const specEditContent = ref('')
  const savingSpec = ref(false)
  const skills = ref<SkillInfo[]>([])
  const traceability = ref<Map<string, TraceabilityInfo>>(new Map())
  let contentRequestId = 0
  let renderRequestId = 0

  const filteredFeatures = computed(() => {
    const query = specSearchQuery.value.trim().toLowerCase()
    if (!query) return features.value
    return features.value.filter((feature) =>
      feature.id.toLowerCase().includes(query) || feature.name.toLowerCase().includes(query)
    )
  })

  const specViewerFeature = computed(() => {
    if (!specViewerFeatureId.value) return null
    return features.value.find((feature) => feature.id === specViewerFeatureId.value) || null
  })

  async function refreshFeatures() {
    loadingFeatures.value = true
    try {
      const response = await $fetch<{ features: SpecFeature[] }>('/api/specs/features')
      features.value = response.features
      void refreshTraceability()
    } finally {
      loadingFeatures.value = false
    }
  }

  async function refreshTraceability() {
    try {
      const response = await $fetch<{ features: TraceabilityInfo[] }>('/api/specs/traceability')
      traceability.value = new Map(response.features.map((feature) => [feature.featureId, feature]))
    } catch (error) {
      console.warn('Failed to load FR traceability', error)
    }
  }

  async function refreshSkills() {
    try {
      const response = await $fetch<{ skills: SkillInfo[] }>('/api/skills')
      skills.value = response.skills
    } catch (error) {
      console.warn('Failed to load skills', error)
    }
  }

  function closeSpecPreview() {
    selectedSpecFile.value = null
    selectedSpecContent.value = ''
    renderedSpecHtml.value = ''
    loadingSpecContent.value = false
  }

  function openSpecViewer(feature: SpecFeature) {
    specViewerFeatureId.value = feature.id
    const file = feature.files.find((entry) => entry.filename === 'spec.md') || feature.files[0]
    if (file) void selectSpecFile(feature.id, file)
    else closeSpecPreview()
  }

  function closeSpecViewer() {
    specViewerFeatureId.value = ''
    closeSpecPreview()
  }

  async function selectSpecFile(featureId: string, file: SpecFile) {
    const requestId = ++contentRequestId
    selectedSpecFile.value = { featureId, filename: file.filename, label: file.label }
    selectedSpecContent.value = ''
    loadingSpecContent.value = true
    try {
      const path = file.filename.split('/').map(encodeURIComponent).join('/')
      const response = await $fetch<{ content: string }>(`/api/specs/${encodeURIComponent(featureId)}/${path}`)
      if (requestId === contentRequestId) selectedSpecContent.value = response.content
    } catch (error) {
      if (requestId === contentRequestId) {
        selectedSpecContent.value = error instanceof Error ? error.message : 'Failed to load spec file'
      }
    } finally {
      if (requestId === contentRequestId) loadingSpecContent.value = false
    }
  }

  function startSpecEdit() {
    if (!selectedSpecFile.value || loadingSpecContent.value) return
    specEditContent.value = selectedSpecContent.value
    showSpecEditModal.value = true
  }

  async function saveSpecEdit() {
    const file = selectedSpecFile.value
    if (!file || savingSpec.value) return
    savingSpec.value = true
    try {
      const path = file.filename.split('/').map(encodeURIComponent).join('/')
      const url: string = `/api/specs/${encodeURIComponent(file.featureId)}/${path}`
      await $fetch(url, {
        method: 'PUT',
        body: { content: specEditContent.value }
      })
      selectedSpecContent.value = specEditContent.value
      showSpecEditModal.value = false
      pushToast('success', `Saved ${file.featureId}/${file.filename}.`)
      void refreshFeatures()
    } catch (error) {
      pushToast('error', `Failed to save spec: ${extractFetchError(error)}`, 6000)
    } finally {
      savingSpec.value = false
    }
  }

  watch([selectedSpecContent, selectedSpecFile], async () => {
    const requestId = ++renderRequestId
    const content = selectedSpecContent.value
    if (!content || !selectedSpecFile.value?.filename.endsWith('.md')) {
      renderedSpecHtml.value = ''
      return
    }
    try {
      const [{ marked }, { default: DOMPurify }] = await Promise.all([import('marked'), import('dompurify')])
      const html = await marked.parse(content, { gfm: true })
      if (requestId === renderRequestId) renderedSpecHtml.value = DOMPurify.sanitize(html)
    } catch {
      if (requestId === renderRequestId) renderedSpecHtml.value = ''
    }
  })

  return {
    features, loadingFeatures, specSearchQuery, filteredFeatures, specViewerFeatureId,
    selectedSpecFile, selectedSpecContent, loadingSpecContent, renderedSpecHtml,
    showSpecEditModal, specEditContent, savingSpec, skills, traceability, specViewerFeature,
    refreshFeatures, refreshTraceability, refreshSkills, closeSpecPreview, openSpecViewer,
    closeSpecViewer, selectSpecFile, startSpecEdit, saveSpecEdit
  }
}
