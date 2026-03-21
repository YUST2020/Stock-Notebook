import { defineStore } from 'pinia'
import axios from 'axios'
import { showToast } from 'vant'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'

export interface Stock {
  code: string;
  name: string;
  holdings?: number;
  costPrice?: number;
  groupId?: string;
}

export interface Group {
  id: string;
  name: string;
}

export const useStockStore = defineStore('stock', {
  state: () => ({
    stocks: [] as Stock[],
    groups: [] as Group[],
    loading: false,
    speechRate: Number(localStorage.getItem('speechRate')) || 0.6,
  }),
  actions: {
    setSpeechRate(rate: number) {
      this.speechRate = rate
      localStorage.setItem('speechRate', rate.toString())
    },
    async fetchGroups() {
      try {
        const res = await axios.get(`${API_BASE}/groups`)
        this.groups = res.data
      } catch (err) {
        showToast('获取分组失败')
      }
    },
    async addGroup(name: string) {
      try {
        const res = await axios.post(`${API_BASE}/groups`, { name })
        this.groups.push(res.data)
        showToast('添加分组成功')
        return true
      } catch (err) {
        showToast('添加分组失败')
        return false
      }
    },
    async updateGroup(id: string, name: string) {
      try {
        const res = await axios.put(`${API_BASE}/groups/${id}`, { name })
        const index = this.groups.findIndex(g => g.id === id)
        if (index !== -1) {
          this.groups[index] = res.data
        }
        showToast('更新分组成功')
        return true
      } catch (err) {
        showToast('更新分组失败')
        return false
      }
    },
    async deleteGroup(id: string) {
      try {
        await axios.delete(`${API_BASE}/groups/${id}`)
        this.groups = this.groups.filter(g => g.id !== id)
        // 重新获取股票列表以更新股票的分组状态
        await this.fetchStocks()
        showToast('删除分组成功')
        return true
      } catch (err) {
        showToast('删除分组失败')
        return false
      }
    },
    async fetchStocks() {
      this.loading = true
      try {
        const res = await axios.get(`${API_BASE}/stocks`)
        this.stocks = res.data
      } catch (err) {
        showToast('获取列表失败')
      } finally {
        this.loading = false
      }
    },
    async addStock(code: string, groupId?: string) {
      try {
        const res = await axios.post(`${API_BASE}/stocks`, { code, groupId })
        this.stocks.push(res.data)
        showToast('添加成功')
        return true
      } catch (err: any) {
        showToast(err.response?.data?.error || '添加失败')
        return false
      }
    },
    async removeStock(code: string) {
      try {
        await axios.delete(`${API_BASE}/stocks/${code}`)
        this.stocks = this.stocks.filter(s => s.code !== code)
        showToast('删除成功')
      } catch (err) {
        showToast('删除失败')
      }
    },
    async updateStock(code: string, data: Partial<Stock>) {
      try {
        const res = await axios.put(`${API_BASE}/stocks/${code}`, data)
        const index = this.stocks.findIndex(s => s.code === code)
        if (index !== -1) {
          this.stocks[index] = res.data
        }
        showToast('更新成功')
        return true
      } catch (err) {
        showToast('更新失败')
        return false
      }
    },
    async tradeStock(code: string, type: 'buy' | 'sell', quantity: number, price: number) {
      try {
        const res = await axios.post(`${API_BASE}/stocks/${code}/trade`, { type, quantity, price })
        const index = this.stocks.findIndex(s => s.code === code)
        if (index !== -1) {
          this.stocks[index] = res.data
        }
        showToast(type === 'buy' ? '买入成功' : '卖出成功')
        return true
      } catch (err: any) {
        showToast(err.response?.data?.error || '交易失败')
        return false
      }
    },
    async updateOrder(codes: string[]) {
      try {
        const res = await axios.put(`${API_BASE}/stocks/sort`, { codes })
        this.stocks = res.data
      } catch (err) {
        showToast('排序失败')
      }
    },
    async getVoiceReport(groupId?: string) {
      try {
        const url = groupId ? `${API_BASE}/voice-report?groupId=${groupId}` : `${API_BASE}/voice-report`
        const res = await axios.get(url)
        return res.data
      } catch (err) {
        return '获取报告失败'
      }
    }
  }
})
