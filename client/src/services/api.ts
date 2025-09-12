import axios from 'axios'
import type { DownloadInfo } from '../../../shared/types'

const API_BASE_URL = '/api'

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000, // 增加到2分钟，适应大文件上传
})

// 请求拦截器
axiosInstance.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
axiosInstance.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    console.error('API Error:', error)
    
    // 更详细的错误信息
    let errorMessage = '请求失败'
    if (error.response?.data?.message) {
      errorMessage = error.response.data.message
    } else if (error.response?.data?.error) {
      errorMessage = error.response.data.error
    } else if (error.message) {
      errorMessage = error.message
    }
    
    // 为常见错误提供友好提示
    if (error.code === 'ECONNABORTED' && error.message.includes('timeout')) {
      errorMessage = '上传超时，请检查网络连接或尝试分批上传'
    } else if (error.response?.status === 413) {
      errorMessage = '文件太大，请选择更小的文件'
    } else if (error.response?.status === 400) {
      errorMessage = error.response.data?.error || '请求参数错误'
    }
    
    // 返回更友好的错误对象
    const friendlyError = new Error(errorMessage)
    friendlyError.name = 'APIError'
    return Promise.reject(friendlyError)
  }
)

export const apiService = {
  // 开始处理视频
  startProcess: async (formData: FormData): Promise<{ processId: string }> => {
    return axiosInstance.post('/process/start', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  // 获取处理状态
  getProcessStatus: async (processId: string) => {
    return axiosInstance.get(`/process/status/${processId}`)
  },

  // 获取下载信息
  getDownloadInfo: async (processId: string): Promise<DownloadInfo> => {
    return axiosInstance.get(`/download/info/${processId}`)
  },

  // 下载处理结果
  downloadResults: async (processId: string): Promise<Blob> => {
    const response = await fetch(`/api/download/${processId}`)
    if (!response.ok) {
      throw new Error('下载失败')
    }
    return response.blob()
  },

  // 打开输出文件夹
  openOutputFolder: async (processId: string) => {
    return axiosInstance.post(`/process/open-folder/${processId}`)
  },

  // 检查服务器状态
  checkServerStatus: async () => {
    return axiosInstance.get('/health')
  },

  // 获取任务列表
  getTaskList: async () => {
    return axiosInstance.get('/process/list')
  },

  // 停止任务
  stopTask: async (processId: string) => {
    return axiosInstance.post(`/process/stop/${processId}`)
  },

  // 删除任务
  deleteTask: async (processId: string) => {
    return axiosInstance.delete(`/process/delete/${processId}`)
  }
}

export default apiService