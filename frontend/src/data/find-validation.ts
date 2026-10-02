import { findRegisterEntry, isRegisterNumber, matchRegisterEntry } from './find-register'
import type { EntryRow } from './types'

export type FindValidation = {
  ok: boolean
  issues: string[]
}

// 单条校验：编号按库房登记簿口径（五位数字，不再按六位重算）；
// 最大尺寸必须填写且为大于 0 的数，非法值直接退回并说明原因。
export function validateFindEntry(entry: Record<string, unknown>): FindValidation {
  const issues: string[] = []
  const number = String(entry.器物编号 ?? '').trim()
  if (number === '') {
    issues.push('器物编号不能为空')
  } else if (!isRegisterNumber(number)) {
    issues.push(`器物编号「${number}」不符合库房登记簿口径：编号应为五位数字，不再按六位重算`)
  }
  const sizeText = String(entry.最大尺寸 ?? '').trim()
  if (sizeText === '') {
    issues.push('最大尺寸不能为空')
  } else {
    const size = Number(sizeText)
    if (Number.isNaN(size)) {
      issues.push(`最大尺寸「${sizeText}」不是数字，请填大于 0 的数值`)
    } else if (size <= 0) {
      issues.push(`最大尺寸必须大于 0，当前为「${sizeText}」`)
    }
  }
  return { ok: issues.length === 0, issues }
}

// 完残程度统一口径：登记簿有记录的以登记簿为准，否则用行内登记值。
// 列表、详情、导出清单都走这里，保证两处读到的一致。
export function resolveCompleteness(row: EntryRow): string {
  const matched = findRegisterEntry(String(row['器物编号'] ?? ''))
  return matched?.完残程度 ?? String(row['完残程度'] ?? '')
}

// 编号冲突裁决：与登记簿对得上（去前导零相同）但写法不一致时，以登记簿为准。
// 已归档的器物沿用登记簿上的既有编号，不再重编；登记簿没有的编号保持原样，不重算。
export function resolveRegisterNumber(row: Record<string, unknown>): { 编号: string; note: string } {
  const current = String(row['器物编号'] ?? '').trim()
  const matched = matchRegisterEntry(current)
  if (!matched || matched.编号 === current) {
    return { 编号: current, note: '' }
  }
  if (matched.已归档) {
    return { 编号: matched.编号, note: `已归档器物沿用登记簿既有编号 ${matched.编号}，不再重编` }
  }
  return { 编号: matched.编号, note: `编号与库房登记簿冲突，已按登记簿更正为 ${matched.编号}` }
}

export type RejudgeResult = {
  rows: EntryRow[]
  changed: boolean
}

// 校验口径调整后，存量记录按新口径重判一遍：编号冲突按登记簿更正，
// 校验结果与说明写回行内，落到出土物清单。
export function rejudgeFindRows(rows: EntryRow[]): RejudgeResult {
  let changed = false
  const next = rows.map((row) => {
    const { 编号, note } = resolveRegisterNumber(row)
    const validation = validateFindEntry({ 器物编号: 编号, 最大尺寸: row['最大尺寸'] })
    const notes = [note, ...validation.issues].filter((item) => item !== '')
    const result: EntryRow = {
      ...row,
      器物编号: 编号,
      校验结果: validation.ok ? '通过' : '退回',
      校验说明: notes.length > 0 ? notes.join('；') : '符合库房登记簿口径',
    }
    if (
      result['器物编号'] !== row['器物编号'] ||
      result['校验结果'] !== row['校验结果'] ||
      result['校验说明'] !== row['校验说明']
    ) {
      changed = true
    }
    return result
  })
  return { rows: next, changed }
}
