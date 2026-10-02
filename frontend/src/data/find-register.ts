// 库房登记簿：出土物编号的权威来源。库房沿用五位老编号，
// 系统侧不再按六位规则重算，编号口径一切以登记簿这一版为准。
export type RegisterEntry = {
  编号: string
  完残程度: string
  已归档: boolean
}

// 登记簿编号口径：五位数字（允许前导零）。
export const REGISTER_NUMBER_PATTERN = /^\d{5}$/

export const FIND_REGISTER: RegisterEntry[] = [
  { 编号: '03127', 完残程度: '完整', 已归档: false },
  { 编号: '02603', 完残程度: '残', 已归档: true },
  { 编号: '04115', 完残程度: '残缺', 已归档: false },
  { 编号: '05208', 完残程度: '完整', 已归档: false },
]

export function isRegisterNumber(value: string): boolean {
  return REGISTER_NUMBER_PATTERN.test(value.trim())
}

// 同一器物判定：去掉前导零后数值相同（五位老编号与系统重编的六位号会在这里对上）。
export function matchRegisterEntry(value: string): RegisterEntry | undefined {
  const normalized = value.trim().replace(/^0+/, '') || '0'
  return FIND_REGISTER.find(
    (entry) => (entry.编号.replace(/^0+/, '') || '0') === normalized,
  )
}

// 精确查找：编号写法完全一致才算命中，用于读取登记簿登记的完残程度。
export function findRegisterEntry(value: string): RegisterEntry | undefined {
  const exact = value.trim()
  return FIND_REGISTER.find((entry) => entry.编号 === exact)
}
