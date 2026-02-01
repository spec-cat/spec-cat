/**
 * Auto Mode spec state persistence
 * Tracks spec hashes, last processed timestamps, and provider session IDs per feature.
 */

import { readSpecCatStore, writeSpecCatStore } from './specCatStore'

export interface AutoModeSpecStateEntry {
  specHash: string
  lastProcessedAt?: string
  sessionId?: string
}

export type AutoModeSpecState = Record<string, AutoModeSpecStateEntry>

const FILENAME = 'auto-mode-specs.json'

export async function readAutoModeSpecState(): Promise<AutoModeSpecState> {
  return readSpecCatStore<AutoModeSpecState>(FILENAME, {})
}

export async function writeAutoModeSpecState(state: AutoModeSpecState): Promise<void> {
  await writeSpecCatStore(FILENAME, state)
}
