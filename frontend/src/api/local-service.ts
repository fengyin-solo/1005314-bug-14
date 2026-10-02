import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import {
  COMPLETENESS_LEVELS,
  validateFindDraft,
  type FindDraft,
} from '@/data/find-policy'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']
const FIND_KEY = 'find'

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  // 出土物的「提交复检」按正向流转处理，异常标记由校验口径重判，不当成负向操作。
  const negative = key !== FIND_KEY && NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb))
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: negative,
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

// 出土物登记保存：字段校验按库房登记簿现行口径，不合法值直接退回并说明原因，不落库。
export function createFind(draft: FindDraft): ActionResult & { fieldErrors?: Record<string, string> } {
  const rows = listRows(FIND_KEY)
  const fieldErrors = validateFindDraft(draft, rows)
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: Object.values(fieldErrors).join('；'), fieldErrors }
  }
  const id = rows.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1
  const created: EntryRow = {
    id,
    status: '待登记',
    pending: true,
    abnormal: false,
    器物编号: draft['器物编号'].trim(),
    出土探方: draft['出土探方'].trim(),
    出土层位: draft['出土层位'].trim(),
    器物类别: draft['器物类别'].trim(),
    质地: draft['质地'].trim(),
    完残程度: draft['完残程度'],
    最大尺寸: draft['最大尺寸'].trim(),
    登记状态: draft['登记状态'].trim() || '在库',
  }
  // saveRows 会再按现行口径重判，校验结果落到出土物清单。
  saveRows(FIND_KEY, [...rows, created])
  return { ok: true, message: `出土物 ${draft['器物编号'].trim()} 已登记保存` }
}

// 详情与列表读同一份存储，字段值不另算，保证两处完残程度等读数完全一致。
export function getFindEntry(id: number): EntryRow | undefined {
  return listRows(FIND_KEY).find((row) => Number(row.id) === id)
}

export function completenessOptions(): readonly string[] {
  return COMPLETENESS_LEVELS
}

// 指标直接从同一份清单计算，统计数与明细同源，避免对不上账。
export function findStats(): { label: string; value: number }[] {
  const rows = listRows(FIND_KEY)
  return [
    { label: '待登记器物', value: rows.filter((row) => row.status === '待登记').length },
    { label: '已编目器物', value: rows.filter((row) => row.status === '已编目').length },
    { label: '本月出土件数', value: rows.length },
    { label: '校验不合格', value: rows.filter((row) => row['校验结果'] === '不合格').length },
  ]
}


export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  // 出土物清单导出带上校验结果与原因，导出内容与页面明细一致。
  const extraFields = key === FIND_KEY ? ['校验结果', '校验说明'] : []
  const header = ['编号', ...meta.fields, ...extraFields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push(
      [
        row.id,
        ...meta.fields.map((field) => row[field] ?? ''),
        ...extraFields.map((field) => row[field] ?? ''),
        row.status,
      ].join(','),
    )
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}
