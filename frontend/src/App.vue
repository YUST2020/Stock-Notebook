<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useStockStore } from './stores/stock'
import draggable from 'vuedraggable'
import { 
  Plus, 
  Trash2, 
  Volume2, 
  GripVertical, 
  RefreshCw,
  Search
} from 'lucide-vue-next'
import { showConfirmDialog, showToast } from 'vant'

const store = useStockStore()
const showAddDialog = ref(false)
const stockCode = ref('')
const isReporting = ref(false)

const stockList = computed({
  get: () => store.stocks,
  set: (value) => {
    store.stocks = value
    store.updateOrder(value.map(s => s.code))
  }
})

onMounted(() => {
  store.fetchStocks()
})

const onAdd = async () => {
  if (!stockCode.value) {
    showToast('请输入股票编码')
    return
  }
  const success = await store.addStock(stockCode.value)
  if (success) {
    showAddDialog.value = false
    stockCode.value = ''
  }
}

const onDelete = (code: string, name: string) => {
  showConfirmDialog({
    title: '确认删除',
    message: `确定要删除自选股 ${name} (${code}) 吗？`,
  }).then(() => {
    store.removeStock(code)
  })
}

const onVoiceReport = async () => {
  isReporting.value = true
  const report = await store.getVoiceReport()
  
  // 使用浏览器自带的 Web Speech API 进行播报
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(report)
    utterance.lang = 'zh-CN'
    utterance.onend = () => {
      isReporting.value = false
    }
    window.speechSynthesis.speak(utterance)
  } else {
    showToast('您的浏览器不支持语音播报')
    isReporting.value = false
    console.log('Report:', report)
  }
}

const onRefresh = () => {
  store.fetchStocks()
}
</script>

<template>
  <div class="min-h-screen bg-gray-100 pb-20">
    <van-nav-bar title="股票查询播报平台" fixed placeholder class="bg-blue-600 text-white shadow-md">
      <template #right>
        <button @click="onRefresh" class="p-2 text-blue-600">
          <RefreshCw :size="24" />
        </button>
      </template>
    </van-nav-bar>

    <main class="p-4 max-w-lg mx-auto">
      <!-- 加载状态显示 -->
      <div v-if="store.loading" class="flex flex-col items-center justify-center py-20">
        <van-loading size="24px" vertical>加载股票列表中...</van-loading>
      </div>

      <!-- 空状态显示 -->
      <div v-else-if="store.stocks.length === 0" class="flex flex-col items-center justify-center py-20 text-gray-500">
        <Search :size="48" class="mb-4 opacity-20" />
        <p class="text-xl">还没有自选股，点击下方按钮添加</p>
      </div>

      <draggable 
        v-else
        v-model="stockList" 
        item-key="code"
        handle=".drag-handle"
        ghost-class="opacity-50"
        :animation="200"
        class="space-y-3"
      >
        <template #item="{ element: stock }">
          <div 
            class="bg-white rounded-lg shadow-sm overflow-hidden flex items-center p-4 border border-transparent active:border-blue-400"
          >
            <div class="drag-handle p-2 mr-2 text-gray-400 cursor-move">
              <GripVertical :size="24" />
            </div>
            <div class="flex-grow">
              <h3 class="text-2xl font-bold text-gray-800">{{ stock.name }}</h3>
              <p class="text-lg text-gray-500 font-mono">{{ stock.code }}</p>
            </div>
            <button 
              @click="onDelete(stock.code, stock.name)"
              class="p-3 text-red-500 active:bg-red-50 rounded-full transition-colors"
            >
              <Trash2 :size="24" />
            </button>
          </div>
        </template>
      </draggable>
    </main>

    <!-- 底部固定按钮区 -->
    <div class="fixed bottom-0 left-0 right-0 p-4 bg-white border-t flex gap-4 max-w-lg mx-auto">
      <van-button 
        type="primary" 
        size="large" 
        round 
        class="flex-1 text-xl h-14"
        @click="showAddDialog = true"
      >
        <template #icon><Plus :size="24" class="mr-1" /></template>
        添加自选股
      </van-button>
      
      <van-button 
        type="success" 
        size="large" 
        round 
        class="flex-1 text-xl h-14"
        @click="onVoiceReport"
        :loading="isReporting"
      >
        <template #icon><Volume2 :size="24" class="mr-1" /></template>
        语音播报
      </van-button>
    </div>

    <!-- 添加对话框 -->
    <van-dialog 
      v-model:show="showAddDialog" 
      title="添加自选股" 
      show-cancel-button 
      @confirm="onAdd"
      class="text-xl"
    >
      <div class="p-6">
        <van-field
          v-model="stockCode"
          placeholder="请输入股票编码 (如: 600519)"
          label="编码"
          type="digit"
          size="large"
          class="text-xl border rounded-md"
          autofocus
        />
        <p class="mt-2 text-sm text-gray-400">目前支持上海(6开头)和深圳(0/3开头)股票</p>
      </div>
    </van-dialog>
  </div>
</template>

<style>
/* 适配高缩放比例 */
.van-nav-bar__title {
  font-size: 1.25rem !important;
  font-weight: bold !important;
}

.van-button--large {
  font-size: 1.25rem !important;
}

.van-dialog__header {
  font-size: 1.5rem !important;
  padding-top: 24px !important;
}

.van-field__label {
  font-size: 1.25rem !important;
}

.van-field__control {
  font-size: 1.25rem !important;
}
</style>
