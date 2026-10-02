import type { EntryRow } from './types'

// 出土物登记（find）模块的校验口径。
// 器物编号以库房登记簿那一版为准：库房沿用老编号，只有五位（五位数字流水号），
// 系统不再按六位重算，也不给任何出土物重新编号。
export const FIND_NUMBER_PATTERN = /^\d{5}$/
export const FIND_NUMBER_RULE_TEXT = '器物编号按库房登记簿口径，为五位数字流水号'

// 「已编目」即已归档入库：已归档出土物沿用既有编号，不再重编，也不重算格式。
export const FIND_ARCHIVED_STATUS = '已编目'

// 完残程度的受控取值：列表与详情读同一个字段、同一套口径，避免两处显示不一致。
export const COMPLETENESS_LEVELS = ['完整', '基本完整', '残损', '破碎'] as const

export const FIND_VALID_PASS = '合格'
export const FIND_VALID_FAIL = '不合格'

export type FindDraft = Record<string, string>
export type FindFieldErrors = Record<string, string>

export function isArchivedStatus(status: string): boolean {
  return status === FIND_ARCHIVED_STATUS
}

export function isArchivedRow(row: EntryRow): boolean {
  return isArchivedStatus(String(row.status ?? ''))
}

// 列表与详情共用同一个单元格读取口径：空值统一显示「—」，杜绝两处读法不一致。
export function formatCell(value: string | number | boolean | undefined | null): string {
  if (value === undefined || value === null) {
    return '—'
  }
  const text = String(value).trim()
  return text === '' ? '—' : text
}

// 最大尺寸必须是大于 0 的厘米数；负数、零、空值、非数字一律退回并说明原因。
export function validateMaxSize(raw: string): string {
  const value = raw.trim()
  if (value === '') {
    return '最大尺寸不能为空，请按实测厘米数填写'
  }
  const num = Number(value)
  if (!Number.isFinite(num)) {
    return '最大尺寸必须是数字（单位：厘米）'
  }
  if (num < 0) {
    return '最大尺寸不能为负数，请核对实测值后重新填写'
  }
  if (num === 0) {
    return '最大尺寸必须大于 0，零不是合法尺寸'
  }
  return ''
}

function validateFindNumber(code: string, row: EntryRow | undefined, duplicate: boolean): string {
  const value = code.trim()
  if (value === '') {
    return '器物编号不能为空'
  }
  // 已归档出土物沿用库房登记簿既有编号，不再重算、不再重编。
  if (row && isArchivedRow(row)) {
    return ''
  }
  if (!FIND_NUMBER_PATTERN.test(value)) {
    return `${FIND_NUMBER_RULE_TEXT}，「${value}」不符合五位编号口径，请回库房登记簿核对`
  }
  if (duplicate) {
    // 两类编号冲突时以库房登记簿为准：系统侧编号让位，保存直接退回。
    return '器物编号与既有记录冲突，编号以库房登记簿为准，请核对后再保存'
  }
  return ''
}

// 登记保存前的逐字段校验，返回每个字段的退回原因（空串表示通过）。
export function validateFindDraft(
  draft: FindDraft,
  existingRows: EntryRow[],
  excludeId: number | null = null,
): FindFieldErrors {
  const errors: FindFieldErrors = {}
  const requiredText: string[] = ['器物编号', '出土探方', '出土层位', '器物类别', '质地']
  for (const field of requiredText) {
    if (draft[field].trim() === '') {
      errors[field] = `${field}不能为空`
    }
  }

  const code = draft['器物编号'].trim()
  const duplicate = existingRows.some(
    (row) => Number(row.id) !== excludeId && String(row['器物编号'] ?? '').trim() === code,
  )
  const codeError = validateFindNumber(
    code,
    excludeId === null ? undefined : existingRows.find((row) => Number(row.id) === excludeId),
    duplicate,
  )
  if (codeError) {
    errors['器物编号'] = codeError
  }

  if (!COMPLETENESS_LEVELS.includes(draft['完残程度'] as (typeof COMPLETENESS_LEVELS)[number])) {
    errors['完残程度'] = '请选择完残程度'
  }

  const sizeError = validateMaxSize(draft['最大尺寸'])
  if (sizeError) {
    errors['最大尺寸'] = sizeError
  }

  return errors
}

// 校验口径调整后对存量记录按新口径重判一遍。
// 结果写回「校验结果 / 校验说明」并同步异常标记：不合格即异常，统计与明细同源。
export function recheckFindRows(rows: EntryRow[]): EntryRow[] {
  // 先找出重号：与库房登记簿编号冲突时，归档（登记簿在册）记录保留，其余退回核对。
  const codeHolders = new Map<string, number>()
  const archivedByCode = new Set<string>()
  for (const row of rows) {
    const code = String(row['器物编号'] ?? '').trim()
    if (code === '') {
      continue
    }
    codeHolders.set(code, (codeHolders.get(code) ?? 0) + 1)
    if (isArchivedRow(row)) {
      archivedByCode.add(code)
    }
  }

  return rows.map((row) => {
    const reasons: string[] = []
    const archived = isArchivedRow(row)
    const code = String(row['器物编号'] ?? '').trim()

    if (archived) {
      // 已归档：沿用既有编号，不再重算格式，更不会重编。
      if (code === '') {
        reasons.push('器物编号缺失，需回库房登记簿补登')
      }
    } else if (code === '') {
      reasons.push('器物编号不能为空')
    } else if (!FIND_NUMBER_PATTERN.test(code)) {
      reasons.push(`${FIND_NUMBER_RULE_TEXT}，「${code}」不符合五位编号口径`)
    } else if ((codeHolders.get(code) ?? 0) > 1 && !archivedByCode.has(code)) {
      reasons.push('器物编号与其他记录冲突，以库房登记簿编号为准')
    } else if ((codeHolders.get(code) ?? 0) > 1 && archivedByCode.has(code)) {
      // 与登记簿在册编号重号：系统侧记录退回，归档记录保留。
      reasons.push('器物编号与库房登记簿在册编号冲突，以登记簿为准')
    }

    const sizeError = validateMaxSize(String(row['最大尺寸'] ?? ''))
    if (sizeError) {
      reasons.push(sizeError)
    }

    const passed = reasons.length === 0
    return {
      ...row,
      校验结果: passed ? FIND_VALID_PASS : FIND_VALID_FAIL,
      校验说明: passed ? (archived ? '已归档，沿用库房登记簿既有编号' : '') : reasons.join('；'),
      // 校验不合格即落异常态，保证看板异常量与清单一致。
      abnormal: !passed,
    }
  })
}
