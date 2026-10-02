<template>
  <section class="page" data-module="find-detail">
    <header class="page-head">
      <div>
        <h2>出土物详情</h2>
        <p class="page-desc">
          详情与出土物清单读同一份登记数据、同一套字段口径，器物编号以库房登记簿为准。
        </p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/find">返回出土物清单</RouterLink>
      </div>
    </header>

    <article v-if="row" class="detail-card">
      <dl class="detail-grid">
        <template v-for="field in detailFields" :key="field">
          <dt>{{ field }}</dt>
          <dd :class="{ 'error-text': field === '校验结果' && row[field] === '不合格' }">
            {{ displayCell(row[field]) }}
          </dd>
        </template>
        <dt>当前状态</dt>
        <dd>{{ row.status }}</dd>
        <dt v-if="isArchived(row)">归档说明</dt>
        <dd v-if="isArchived(row)" class="muted-text">已归档出土物沿用库房登记簿既有编号，不再重编</dd>
      </dl>

      <p v-if="String(row['校验说明'] ?? '')" class="detail-note">
        <span :class="row['校验结果'] === '不合格' ? 'error-text' : 'muted-text'">
          校验说明：{{ row['校验说明'] }}
        </span>
      </p>

      <div class="detail-actions">
        <button
          v-for="action in actions"
          :key="action"
          class="btn"
          type="button"
          @click="runAction(action)"
        >
          {{ action }}
        </button>
      </div>
      <p v-if="message" :class="resultOk ? 'muted-text' : 'error-text'">{{ message }}</p>
    </article>

    <p v-else class="empty-state">没有找到这条出土物记录，可能已被重置。</p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { getFindEntry, runAction as applyAction } from '@/api/local-service'
import { formatCell, isArchivedRow } from '@/data/find-policy'
import type { EntryRow } from '@/data/types'

const route = useRoute()
const router = useRouter()
const actions = ['提交登记', '完成编目', '提交复检']
// 详情字段与清单列同源；校验结果也在这里展示，口径只有一份。
const detailFields = [
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

const row = ref<EntryRow | undefined>()
const message = ref('')
const resultOk = ref(false)

function reload() {
  row.value = getFindEntry(Number(route.params.id))
}

function isArchived(entry: EntryRow): boolean {
  return isArchivedRow(entry)
}

function displayCell(value: string | number | boolean | undefined | null): string {
  return formatCell(value)
}

function runAction(action: string) {
  if (!row.value) {
    return
  }
  const result = applyAction('find', Number(row.value.id), action)
  resultOk.value = result.ok
  message.value = result.message
  if (result.ok) {
    reload()
    router.replace(route.fullPath)
  }
}

onMounted(reload)
</script>
