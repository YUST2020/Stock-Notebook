import { defineStore } from 'pinia'
import axios from 'axios'
import { showToast } from 'vant'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'

export interface Stock {
  code: string;
  name: string;
  holdings?: number;
  costPrice?: number;
}

export const useStockStore = defineStore('stock', {
  state: () => ({
    stocks: [] as Stock[],
    loading: false,
  }),
  actions: {
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
    async addStock(code: string) {
      try {
        const res = await axios.post(`${API_BASE}/stocks`, { code })
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
    async getVoiceReport() {
      try {
        const res = await axios.get(`${API_BASE}/voice-report`)
        return res.data
      } catch (err) {
        return '获取报告失败'
      }
    }
  }
})
