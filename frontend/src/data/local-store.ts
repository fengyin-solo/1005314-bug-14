import { SEED_ROWS } from './seed'
import { recheckFindRows } from './find-policy'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'archaeology-field:entries'
const FIND_KEY = 'find'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// 出土物模块在读取时统一按库房登记簿现行口径重判存量记录，
// 校验结果落到清单字段并持久化；其他模块原样返回。
function applyModulePolicy(data: Record<string, EntryRow[]>): Record<string, EntryRow[]> {
  if (!Array.isArray(data[FIND_KEY])) {
    return data
  }
  return { ...data, [FIND_KEY]: recheckFindRows(data[FIND_KEY]) }
}

function persistIfNeeded(
  raw: Record<string, EntryRow[]>,
  rechecked: Record<string, EntryRow[]>,
): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  const before = raw[FIND_KEY] ?? []
  const after = rechecked[FIND_KEY] ?? []
  const changed =
    before.length !== after.length ||
    after.some(
      (row, index) =>
        JSON.stringify(row) !== JSON.stringify(before[index]),
    )
  if (changed) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rechecked))
  }
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = applyModulePolicy(clone(SEED_ROWS))
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    const merged = { ...clone(SEED_ROWS), ...parsed }
    const rechecked = applyModulePolicy(merged)
    persistIfNeeded(merged, rechecked)
    return rechecked
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
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
  // 出土物落库前再按现行口径判一次，保证库里数据与明细、统计同源对得上。
  const checked = key === FIND_KEY ? recheckFindRows(rows) : rows
  const next = { ...allRows(), [key]: checked }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return listRows(key)
}

export function storageKey(): string {
  return STORAGE_KEY
}
