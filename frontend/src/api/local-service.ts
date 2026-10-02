import { MODULE_BY_KEY } from '@/data/modules'
import { findRegisterEntry } from '@/data/find-register'
import { resolveRegisterNumber, resolveCompleteness, validateFindEntry } from '@/data/find-validation'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

// 完残程度的统一读取口径也从这里出去，列表、详情、导出读到的是同一份。
export { resolveCompleteness }

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

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
  if (key === 'find') {
    // 出土物流转前先过现行校验口径，非法值直接退回并说明原因。
    const validation = validateFindEntry(rows[index])
    if (!validation.ok) {
      return { ok: false, message: `出土物校验未通过，已退回：${validation.issues.join('；')}` }
    }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

// 出土物登记保存：先按库房登记簿口径校验，非法值直接退回并说明原因，不落库。
export function createFindEntry(fields: Record<string, string>): ActionResult {
  const meta = moduleMeta('find')
  const rows = listRows('find')
  const { 编号, note } = resolveRegisterNumber({ 器物编号: fields['器物编号'] ?? '' })
  const validation = validateFindEntry({ ...fields, 器物编号: 编号 })
  if (!validation.ok) {
    return { ok: false, message: `出土物登记被退回：${validation.issues.join('；')}` }
  }
  const id = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const entry: EntryRow = {
    id,
    status: meta.statuses[0],
    pending: true,
    abnormal: false,
    ...fields,
    器物编号: 编号,
    登记状态: findRegisterEntry(编号) ? '已登簿' : '未登簿',
    校验结果: '通过',
    校验说明: note === '' ? '符合库房登记簿口径' : note,
  }
  saveRows('find', [...rows, entry])
  return { ok: true, message: `${meta.entity}已登记，器物编号 ${编号}` }
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    const cells = meta.fields.map((field) => {
      if (key === 'find' && field === '完残程度') {
        return resolveCompleteness(row)
      }
      return row[field] ?? ''
    })
    lines.push([row.id, ...cells, row.status].join(','))
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
