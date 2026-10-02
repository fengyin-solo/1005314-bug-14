<template>
  <section class="page" data-module="find">
    <header class="page-head">
      <div>
        <h2>出土物登记管理</h2>
        <p class="page-desc">
          维护出土物，围绕器物编号、出土探方、出土层位、器物类别做登记、筛选与状态流转。
          器物编号按库房登记簿口径（五位数字流水号）判定，已归档出土物沿用既有编号、不再重编。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记出土物</button>
        <button class="btn" type="button" @click="exportRows">导出出土物登记清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">
            <RouterLink v-if="column === '器物编号'" class="link" :to="`/find/${row.id}`">
              {{ displayCell(row[column]) }}
            </RouterLink>
            <span
              v-else
              :class="{ 'error-text': column === '校验结果' && row[column] === '不合格' }"
              :title="column === '校验结果' ? displayCell(row['校验说明']) : undefined"
            >
              {{ displayCell(row[column]) }}
            </span>
          </td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
            <RouterLink class="link" :to="`/find/${row.id}`">详情</RouterLink>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无出土物登记数据，可先登记出土物</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条出土物登记记录，统计与明细同源计算</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <div v-if="creating" class="modal-mask" @click.self="closeCreate">
      <form class="modal-card" @submit.prevent="submitCreate">
        <h3 class="modal-title">登记出土物</h3>
        <p class="modal-hint">器物编号按库房登记簿口径填写五位数字流水号；最大尺寸为大于 0 的厘米数。</p>
        <label v-for="field in formFields" :key="field" class="form-item">
          <span>{{ field }}</span>
          <select v-if="field === '完残程度'" v-model="form[field]">
            <option value="" disabled>请选择</option>
            <option v-for="level in completenessOptions" :key="level" :value="level">{{ level }}</option>
          </select>
          <input
            v-else
            v-model="form[field]"
            :type="field === '最大尺寸' ? 'number' : 'text'"
            :step="field === '最大尺寸' ? '0.1' : undefined"
            :placeholder="
              field === '器物编号'
                ? '五位数字流水号，如 10004'
                : field === '登记状态'
                  ? '默认在库，可按库房登记填写'
                  : `请填写${field}`
            "
          />
          <small v-if="fieldErrors[field]" class="error-text">{{ fieldErrors[field] }}</small>
        </label>
        <div class="modal-actions">
          <button class="btn primary" type="submit">保存</button>
          <button class="btn ghost" type="button" @click="closeCreate">取消</button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  completenessOptions,
  createFind,
  downloadEntries,
  findStats,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import { formatCell } from '@/data/find-policy'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('find')
// 校验结果落到出土物清单：最大尺寸等非法值在这一列标不合格并写明原因。
const columns = [
  '器物编号',
  '出土探方',
  '出土层位',
  '器物类别',
  '质地',
  '完残程度',
  '最大尺寸',
  '登记状态',
  '校验结果',
]
const actions = ['提交登记', '完成编目', '提交复检']
const statuses = ['待登记', '已登记', '已编目', '待复检']
const formFields = [
  '器物编号',
  '出土探方',
  '出土层位',
  '器物类别',
  '质地',
  '完残程度',
  '最大尺寸',
  '登记状态',
]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = ['器物编号', '出土探方', '出土层位']
// 指标从清单实时计算，不再写死，保证统计数与明细对得上。
const stats = computed(() => findStats())
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

const creating = ref(false)
const form = reactive<Record<string, string>>(Object.fromEntries(formFields.map((field) => [field, ''])))
const fieldErrors = ref<Record<string, string>>({})

function displayCell(value: string | number | boolean | undefined | null): string {
  return formatCell(value)
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  for (const field of formFields) {
    form[field] = ''
  }
  fieldErrors.value = {}
  errorMessage.value = ''
  creating.value = true
}

function closeCreate() {
  creating.value = false
}

function submitCreate() {
  fieldErrors.value = {}
  errorMessage.value = ''
  const result = createFind({ ...form })
  if (!result.ok) {
    // 非法值直接退回：页脚给整单原因，字段下方给该字段的具体原因。
    errorMessage.value = result.message
    if (result.fieldErrors) {
      fieldErrors.value = result.fieldErrors
    }
    return
  }
  creating.value = false
  reload()
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '出土物登记列表读取失败'
  }
}

onMounted(reload)
</script>
