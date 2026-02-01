export function providerJsonEvent(data: unknown): string {
  return JSON.stringify({ type: 'provider_json', data }) + '\n'
}

export function sessionResetEvent(reason: string): string {
  return JSON.stringify({ type: 'session_reset', reason }) + '\n'
}

export function errorEvent(message: string): string {
  return JSON.stringify({ type: 'error', error: message }) + '\n'
}

export function doneEvent(): string {
  return JSON.stringify({ type: 'done' }) + '\n'
}
