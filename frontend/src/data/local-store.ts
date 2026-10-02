import { rejudgeFindRows } from './find-validation'
import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'archaeology-field:entries'

// 出土物校验口径的版本标记：口径调整一次就升一次版本，
// 版本不符时对存量记录按新口径重判一遍，保证只重判一次。
const FIND_RULES_VERSION = 'find-rules:register-v1'
const FIND_RULES_VERSION_KEY = 'archaeology-field:find-rules-version'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function applyFindRejudge(data: Record<string, EntryRow[]>): Record<string, EntryRow[]> {
  if (typeof window === 'undefined' || !window.localStorage) {
    return data
  }
  if (window.localStorage.getItem(FIND_RULES_VERSION_KEY) === FIND_RULES_VERSION) {
    return data
  }
  const next = { ...data, find: rejudgeFindRows(data.find ?? []).rows }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.localStorage.setItem(FIND_RULES_VERSION_KEY, FIND_RULES_VERSION)
  return next
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return applyFindRejudge(fallback)
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    return applyFindRejudge({ ...fallback, ...parsed })
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return applyFindRejudge(fallback)
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  let rows = clone(SEED_ROWS[key] ?? [])
  if (key === 'find') {
    rows = rejudgeFindRows(rows).rows
  }
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}
