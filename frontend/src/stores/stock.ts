import { defineStore } from 'pinia'
import axios from 'axios'
import { showToast } from 'vant'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'

export interface Stock {
  code: string;
  name: string;
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
