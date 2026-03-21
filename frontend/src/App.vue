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
  Search,
  Edit2,
  ArrowUpCircle,
  ArrowDownCircle,
  Settings,
  FolderKanban
} from 'lucide-vue-next'
import { showConfirmDialog, showToast } from 'vant'

const store = useStockStore()
const showAddDialog = ref(false)
const showEditDialog = ref(false)
const showTradeDialog = ref(false)
const showSettingsDialog = ref(false)
const showGroupManageDialog = ref(false)
const showGroupPicker = ref(false)
const stockCode = ref('')
const speechRate = ref(store.speechRate)
const activeTab = ref('')
const newGroupName = ref('')

// 确保对话框打开时语速值是最新的
const openSettings = () => {
  speechRate.value = store.speechRate
  showSettingsDialog.value = true
}

const editingStock = ref({
  code: '',
  name: '',
  holdings: 0,
  costPrice: 0,
  groupId: '' as string | undefined
})
const tradeInfo = ref({
  code: '',
  name: '',
  type: 'buy' as 'buy' | 'sell',
  quantity: '',
  price: ''
})
const isReporting = ref(false)

const filteredStocks = computed(() => {
  if (!activeTab.value) return store.stocks
  return store.stocks.filter(s => s.groupId === activeTab.value)
})

const stockList = computed({
  get: () => filteredStocks.value,
  set: (value) => {
    // 保持未显示的股票不动，只更新当前分组的顺序
    const otherStocks = store.stocks.filter(s => activeTab.value ? s.groupId !== activeTab.value : false)
    const newOrder = [...value, ...otherStocks]
    store.stocks = newOrder
    store.updateOrder(value.map(s => s.code))
  }
})

const groupPickerColumns = computed(() => {
  return [
    { text: '全部(无分组)', value: '' },
    ...store.groups.map(g => ({ text: g.name, value: g.id }))
  ]
})

const onGroupPickerConfirm = ({ selectedOptions }: any) => {
  editingStock.value.groupId = selectedOptions[0].value
  showGroupPicker.value = false
}

const getGroupName = (groupId: string | undefined) => {
  if (!groupId) return '全部(无分组)'
  const group = store.groups.find(g => g.id === groupId)
  return group ? group.name : '全部(无分组)'
}

onMounted(() => {
  store.fetchGroups()
  store.fetchStocks()
  
  // 预热 Web Speech API，帮助某些移动端浏览器加载声音列表
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices()
  }
})

const onAddGroup = async () => {
  if (!newGroupName.value) {
    showToast('请输入分组名称')
    return
  }
  const success = await store.addGroup(newGroupName.value)
  if (success) {
    newGroupName.value = ''
  }
}

const onDeleteGroup = (id: string, name: string) => {
  showConfirmDialog({
    title: '确认删除分组',
    message: `确定要删除分组 "${name}" 吗？该分组下的股票不会被删除。`,
  }).then(() => {
    store.deleteGroup(id)
    if (activeTab.value === id) {
      activeTab.value = ''
    }
  })
}

const onAdd = async () => {
  if (!stockCode.value) {
    showToast('请输入股票编码')
    return
  }
  // 如果当前在某个分组下，添加时直接分配到该分组
  const groupId = activeTab.value || undefined
  const success = await store.addStock(stockCode.value, groupId)
  if (success) {
    showAddDialog.value = false
    stockCode.value = ''
  }
}

const onEdit = (stock: any) => {
  editingStock.value = {
    code: stock.code,
    name: stock.name,
    holdings: stock.holdings || 0,
    costPrice: stock.costPrice || 0,
    groupId: stock.groupId || ''
  }
  showEditDialog.value = true
}

const onUpdate = async () => {
  const success = await store.updateStock(editingStock.value.code, {
    holdings: Number(editingStock.value.holdings),
    costPrice: Number(editingStock.value.costPrice),
    groupId: editingStock.value.groupId || undefined
  })
  if (success) {
    showEditDialog.value = false
  }
}

const onOpenTrade = (stock: any, type: 'buy' | 'sell') => {
  tradeInfo.value = {
    code: stock.code,
    name: stock.name,
    type,
    quantity: '',
    price: ''
  }
  showTradeDialog.value = true
}

const onTrade = async () => {
  if (!tradeInfo.value.quantity) {
    showToast('请输入数量')
    return
  }
  if (tradeInfo.value.type === 'buy' && !tradeInfo.value.price) {
    showToast('请输入买入价格')
    return
  }

  const success = await store.tradeStock(
    tradeInfo.value.code,
    tradeInfo.value.type,
    Number(tradeInfo.value.quantity),
    Number(tradeInfo.value.price || 0)
  )
  if (success) {
    showTradeDialog.value = false
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
  if (!('speechSynthesis' in window)) {
    showToast('您的浏览器不支持语音播报')
    return
  }

  // 1. 立即尝试解锁语音合成 (部分移动端浏览器需要同步调用以触发权限)
  const unlockUtterance = new SpeechSynthesisUtterance('')
  window.speechSynthesis.speak(unlockUtterance)
  window.speechSynthesis.cancel() // 立即取消静默播放

  isReporting.value = true
  try {
    const report = await store.getVoiceReport(activeTab.value)
    
    if (!report) {
      showToast('没有可播报的内容')
      isReporting.value = false
      return
    }

    const utterance = new SpeechSynthesisUtterance(report)
    
    // 2. 增强语言设置兼容性
    const voices = window.speechSynthesis.getVoices()
    const zhVoice = voices.find(v => v.lang === 'zh-CN' || v.lang === 'zh_CN')
    if (zhVoice) {
      utterance.voice = zhVoice
    }
    utterance.lang = 'zh-CN'
    utterance.rate = store.speechRate // 语速
    utterance.pitch = 1.0 // 音调
    
    utterance.onend = () => {
      isReporting.value = false
    }

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event)
      // 某些浏览器（如手机微信/搜狗）可能会抛出 'not-allowed' 错误
      if (event.error === 'not-allowed') {
        showToast('请在点击后不要离开页面以允许播报')
      } else {
        showToast('语音播报出错: ' + event.error)
      }
      isReporting.value = false
    }

    // 在播报前先取消之前的播报，防止队列堆积
    window.speechSynthesis.cancel()
    
    // 延迟一小会儿执行，有助于某些浏览器的稳定性
    setTimeout(() => {
      window.speechSynthesis.speak(utterance)
    }, 100)
    
  } catch (error) {
    console.error('Failed to get report:', error)
    showToast('获取播报内容失败')
    isReporting.value = false
  }
}

const onRefresh = () => {
  store.fetchStocks()
}
</script>

<template>
  <div class="min-h-screen bg-gray-100 pb-20">
    <van-nav-bar title="股票查询播报平台" fixed placeholder class="bg-blue-600 text-white shadow-md z-50">
      <template #left>
        <button @click="openSettings" class="p-2 text-blue-600">
          <Settings :size="24" />
        </button>
      </template>
      <template #right>
        <div class="flex items-center gap-2">
          <button @click="showGroupManageDialog = true" class="p-2 text-blue-600">
            <FolderKanban :size="24" />
          </button>
          <button @click="onRefresh" class="p-2 text-blue-600">
            <RefreshCw :size="24" />
          </button>
        </div>
      </template>
    </van-nav-bar>

    <div class="sticky top-[46px] z-40 bg-gray-100 pb-2">
      <van-tabs v-model:active="activeTab" class="mb-2 shadow-sm">
        <van-tab title="全部" name=""></van-tab>
        <van-tab v-for="group in store.groups" :key="group.id" :title="group.name" :name="group.id"></van-tab>
      </van-tabs>
    </div>

    <main class="p-4 max-w-lg mx-auto">
      <!-- 加载状态显示 -->
      <div v-if="store.loading" class="flex flex-col items-center justify-center py-20">
        <van-loading size="24px" vertical>加载股票列表中...</van-loading>
      </div>

      <!-- 空状态显示 -->
      <div v-else-if="filteredStocks.length === 0" class="flex flex-col items-center justify-center py-20 text-gray-500">
        <Search :size="48" class="mb-4 opacity-20" />
        <p class="text-xl">当前分组没有自选股，点击下方按钮添加</p>
      </div>

      <draggable 
        v-model="stockList" 
        item-key="code"
        handle=".drag-handle"
        ghost-class="opacity-50"
        :animation="200"
        class="space-y-4"
      >
        <template #item="{ element: stock }">
          <div 
            class="bg-white rounded-xl shadow-md overflow-hidden p-4 border-2 border-transparent active:border-blue-400"
          >
            <!-- 顶部：拖拽手柄、股票名称和代码 -->
            <div class="flex items-start mb-3">
              <div class="drag-handle flex-shrink-0 p-3 -ml-3 mr-2 text-gray-400 cursor-move self-center">
                <GripVertical :size="32" />
              </div>
              <div class="flex-grow min-w-0">
                <div class="flex flex-col">
                  <h3 class="text-3xl font-bold text-gray-900 leading-tight break-words">{{ stock.name }}</h3>
                  <span class="text-xl text-gray-500 font-mono mt-1">{{ stock.code }}</span>
                </div>
              </div>
            </div>

            <!-- 中间：持仓信息（垂直排列，减少水平占用） -->
            <div v-if="stock.holdings || stock.costPrice" class="bg-gray-50 rounded-lg p-3 space-y-2 mb-4">
              <div v-if="stock.holdings" class="flex justify-between items-center text-xl">
                <span class="text-gray-500">当前持股</span>
                <span class="text-blue-600 font-bold font-mono">{{ stock.holdings }} 股</span>
              </div>
              <div v-if="stock.costPrice" class="flex justify-between items-center text-xl">
                <span class="text-gray-500">持仓成本</span>
                <span class="text-orange-600 font-bold font-mono">{{ stock.costPrice }} 元</span>
              </div>
            </div>

            <!-- 底部：操作按钮（网格排列，大尺寸易点击） -->
            <div class="grid grid-cols-4 gap-3 border-t border-gray-100 pt-4">
              <button 
                @click="onOpenTrade(stock, 'buy')"
                class="flex flex-col items-center justify-center p-3 bg-red-50 text-red-600 rounded-xl active:bg-red-100 transition-colors"
              >
                <ArrowUpCircle :size="32" />
                <span class="text-lg font-bold mt-1">买入</span>
              </button>
              <button 
                @click="onOpenTrade(stock, 'sell')"
                class="flex flex-col items-center justify-center p-3 bg-green-50 text-green-700 rounded-xl active:bg-green-100 transition-colors"
              >
                <ArrowDownCircle :size="32" />
                <span class="text-lg font-bold mt-1">卖出</span>
              </button>
              <button 
                @click="onEdit(stock)"
                class="flex flex-col items-center justify-center p-3 bg-blue-50 text-blue-600 rounded-xl active:bg-blue-100 transition-colors"
              >
                <Edit2 :size="32" />
                <span class="text-lg font-bold mt-1">修改</span>
              </button>
              <button 
                @click="onDelete(stock.code, stock.name)"
                class="flex flex-col items-center justify-center p-3 bg-gray-50 text-gray-400 rounded-xl active:bg-gray-200 transition-colors"
              >
                <Trash2 :size="32" />
                <span class="text-lg font-bold mt-1">删除</span>
              </button>
            </div>
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
          placeholder="请输入股票编码 (如: 600519, 510050)"
          label="编码"
          type="digit"
          size="large"
          class="text-xl border rounded-md"
          autofocus
        />
        <p class="mt-2 text-sm text-gray-400">目前支持上海(6/5开头)和深圳(0/3/1开头)股票</p>
      </div>
    </van-dialog>

    <!-- 编辑对话框 -->
    <van-dialog 
      v-model:show="showEditDialog" 
      :title="'编辑: ' + editingStock.name" 
      show-cancel-button 
      @confirm="onUpdate"
      class="text-xl"
    >
      <div class="p-6 space-y-4">
        <van-field
          v-model="editingStock.holdings"
          label="持股数"
          type="digit"
          placeholder="请输入持股数量"
          size="large"
          class="text-xl border rounded-md"
        />
        <van-field
          v-model="editingStock.costPrice"
          label="成本价"
          type="number"
          placeholder="请输入成本价格"
          size="large"
          class="text-xl border rounded-md"
        />
        <van-field
          :model-value="getGroupName(editingStock.groupId)"
          is-link
          readonly
          label="所属分组"
          placeholder="选择分组"
          size="large"
          class="text-xl border rounded-md"
          @click="showGroupPicker = true"
        />
      </div>
     </van-dialog>

     <van-popup v-model:show="showGroupPicker" round position="bottom">
       <van-picker
         :columns="groupPickerColumns"
         @cancel="showGroupPicker = false"
         @confirm="onGroupPickerConfirm"
         title="选择分组"
       />
     </van-popup>
 
     <!-- 交易对话框 -->
     <van-dialog 
       v-model:show="showTradeDialog" 
       :title="(tradeInfo.type === 'buy' ? '买入: ' : '卖出: ') + tradeInfo.name" 
       show-cancel-button 
       @confirm="onTrade"
       class="text-xl"
     >
       <div class="p-6 space-y-4">
         <van-field
           v-model="tradeInfo.quantity"
           :label="tradeInfo.type === 'buy' ? '买入数量' : '卖出数量'"
           type="digit"
           placeholder="请输入股票数量"
           size="large"
           class="text-xl border rounded-md"
           autofocus
         />
         <van-field
           v-if="tradeInfo.type === 'buy'"
           v-model="tradeInfo.price"
           label="买入价格"
           type="number"
           placeholder="请输入本次买入单价"
           size="large"
           class="text-xl border rounded-md"
         />
         <p v-if="tradeInfo.type === 'buy'" class="text-sm text-gray-500">
           提示：买入后系统将自动重新计算摊薄后的成本价。
         </p>
         <p v-else class="text-sm text-gray-500">
           提示：卖出将减少持仓数量，成本价保持不变。
         </p>
       </div>
     </van-dialog>

     <!-- 设置对话框 -->
     <van-dialog 
       v-model:show="showSettingsDialog" 
       title="播报设置" 
       show-cancel-button 
       @confirm="store.setSpeechRate(speechRate)"
       class="text-xl"
     >
       <div class="p-6 space-y-6">
         <div class="space-y-4">
           <div class="flex justify-between items-center">
             <span class="text-lg text-gray-600">语速调整</span>
             <span class="text-blue-600 font-bold font-mono">{{ speechRate.toFixed(1) }}x</span>
           </div>
           <van-slider 
             v-model="speechRate" 
             :min="0.1" 
             :max="2.0" 
             :step="0.1" 
             active-color="#3b82f6"
           >
             <template #button>
               <div class="w-6 h-6 bg-blue-600 rounded-full border-2 border-white shadow-md"></div>
             </template>
           </van-slider>
           <div class="flex justify-between text-xs text-gray-400">
             <span>慢</span>
             <span>正常 (1.0)</span>
             <span>快</span>
           </div>
         </div>
       </div>
     </van-dialog>

     <!-- 分组管理对话框 -->
     <van-dialog 
       v-model:show="showGroupManageDialog" 
       title="分组管理" 
       class="text-xl"
       confirm-button-text="关闭"
     >
       <div class="p-6 space-y-4 max-h-96 overflow-y-auto">
         <!-- 添加新分组 -->
         <div class="flex gap-2">
           <van-field
             v-model="newGroupName"
             placeholder="输入新分组名称"
             class="border rounded-md flex-1"
           />
           <van-button type="primary" @click="onAddGroup" class="rounded-md">添加</van-button>
         </div>

         <!-- 分组列表 -->
         <div v-if="store.groups.length === 0" class="text-center text-gray-400 py-4">
           暂无分组
         </div>
         <div v-else class="space-y-2 mt-4">
           <div 
             v-for="group in store.groups" 
             :key="group.id" 
             class="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
           >
             <span class="text-lg font-bold">{{ group.name }}</span>
             <button 
               @click="onDeleteGroup(group.id, group.name)"
               class="p-2 text-red-500 active:bg-red-100 rounded-full transition-colors"
             >
               <Trash2 :size="20" />
             </button>
           </div>
         </div>
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
