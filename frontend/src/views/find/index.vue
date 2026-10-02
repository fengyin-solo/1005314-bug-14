<template>
  <section class="page" data-module="find">
    <header class="page-head">
      <div>
        <h2>出土物登记管理</h2>
        <p class="page-desc">维护出土物，围绕器物编号、出土探方、出土层位、器物类别做登记、筛选与状态流转。编号口径以库房登记簿为准。</p>
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
            <span v-if="column === '校验结果'" :class="row[column] === '退回' ? 'error-text' : ''">
              {{ row[column] || '—' }}
            </span>
            <template v-else>{{ cellValue(row, column) }}</template>
          </td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button class="link" type="button" @click="openDetail(row)">详情</button>
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无出土物登记数据，可先登记出土物</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条出土物登记记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <div v-if="createVisible" class="modal-mask" @click.self="closeCreate">
      <div class="modal">
        <header class="modal-head">
          <h3 class="modal-title">登记出土物</h3>
          <button class="link" type="button" @click="closeCreate">关闭</button>
        </header>
        <form class="form-grid" @submit.prevent="submitCreate">
          <label v-for="field in formFields" :key="field" class="form-item">
            <span>{{ field }}</span>
            <input v-model="form[field]" :placeholder="field === '器物编号' ? '库房登记簿五位编号' : `填写${field}`" />
          </label>
          <p v-if="createError" class="error-text form-error">{{ createError }}</p>
          <footer class="modal-foot">
            <button class="btn ghost" type="button" @click="closeCreate">取消</button>
            <button class="btn primary" type="submit">保存登记</button>
          </footer>
        </form>
      </div>
    </div>

    <div v-if="detailRow" class="modal-mask" @click.self="closeDetail">
      <div class="modal">
        <header class="modal-head">
          <h3 class="modal-title">出土物详情 · {{ detailRow['器物编号'] }}</h3>
          <button class="link" type="button" @click="closeDetail">关闭</button>
        </header>
        <dl class="detail-list">
          <template v-for="field in detailFields" :key="field">
            <dt>{{ field }}</dt>
            <dd>{{ field === '完残程度' ? completenessOf(detailRow) : (detailRow[field] ?? '—') }}</dd>
          </template>
          <dt>当前状态</dt>
          <dd>{{ detailRow.status }}</dd>
        </dl>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  createFindEntry,
  downloadEntries,
  listEntries,
  moduleMeta,
  resolveCompleteness,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('find')
const columns = ["器物编号", "出土探方", "出土层位", "器物类别", "质地", "完残程度", "最大尺寸", "登记状态", "校验结果"]
const actions = ["提交登记", "完成编目", "提交复检"]
const statuses = ["待登记", "已登记", "已编目", "待复检"]
const formFields = ["器物编号", "出土探方", "出土层位", "器物类别", "质地", "完残程度", "最大尺寸"]
const detailFields = [...columns, "校验说明"]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)

// 统计卡按明细行实算，保证统计口径与清单一致。
const stats = computed(() => [
  { label: '待登记器物', value: rows.value.filter((row) => row.status === '待登记').length },
  { label: '已编目器物', value: rows.value.filter((row) => row.status === '已编目').length },
  { label: '本月出土件数', value: rows.value.length },
])
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

const createVisible = ref(false)
const createError = ref('')
const form = ref<Record<string, string>>({})
const detailRow = ref<EntryRow | null>(null)

// 完残程度列表与详情都从这里读，口径与库房登记簿一致。
function completenessOf(row: EntryRow): string {
  return resolveCompleteness(row) || '—'
}

function cellValue(row: EntryRow, column: string): string | number | boolean {
  if (column === '完残程度') {
    return completenessOf(row)
  }
  return row[column] ?? '—'
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  form.value = {}
  createError.value = ''
  createVisible.value = true
}

function closeCreate() {
  createVisible.value = false
}

function submitCreate() {
  createError.value = ''
  const result = createFindEntry({ ...form.value })
  if (!result.ok) {
    createError.value = result.message
    return
  }
  closeCreate()
  reload()
}

function openDetail(row: EntryRow) {
  detailRow.value = row
}

function closeDetail() {
  detailRow.value = null
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
