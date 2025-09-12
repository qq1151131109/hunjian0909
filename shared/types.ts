// 共享类型定义

export interface VideoFile {
  id: string;
  originalPath: string;
  relativePath: string;
  name: string;
  size: number;
  type: string;
}

export interface ProcessConfig {
  audioDuration: number; // 音频时长（秒）
  audioFile?: File; // 要添加的音频文件
  subtitlePath: string; // 字幕文件路径
  subtitleStyle: string; // 字幕样式ID
  customSubtitleSettings?: any; // 自定义字幕设置
  trailerVideo?: File; // 引流视频文件
  userId?: string; // 用户ID
  userLabel?: string; // 用户显示名称
}

export interface ProcessStatus {
  id: string;
  userId: string; // 用户标识ID（可以是昵称、IP或会话ID）
  userLabel?: string; // 可选的用户显示名称
  status: 'pending' | 'processing' | 'completed' | 'error';
  currentFile?: string;
  currentStep?: string;
  progress: number; // 0-100
  totalFiles: number;
  processedFiles: number;
  resultVideoCount?: number; // 结果视频数量
  error?: string;
  createdAt: Date; // 任务创建时间
}

export interface ProcessResult {
  id: string;
  processId: string;
  originalFile: string;
  outputFile: string;
  status: 'success' | 'error';
  error?: string;
}

export interface DownloadInfo {
  id: string;
  filename: string;
  size: number;
  url: string;
}