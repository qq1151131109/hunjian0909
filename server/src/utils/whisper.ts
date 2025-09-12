import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs-extra'

export class WhisperService {
  
  /**
   * 使用faster-whisper Python脚本生成字幕
   */
  async generateSubtitleFromAudio(audioPath: string, outputDir: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const outputName = path.basename(audioPath, path.extname(audioPath))
      const srtPath = path.join(outputDir, `${outputName}.srt`)
      
      console.log(`开始使用faster-whisper生成字幕: ${audioPath} -> ${srtPath}`)
      
      // 创建临时Python脚本
      const pythonScript = `
import os
import sys
from faster_whisper import WhisperModel

# 配置国内镜像源
os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
os.environ["HUGGINGFACE_HUB_CACHE"] = os.path.expanduser("~/.cache/huggingface")
# 设置镜像地址
try:
    import huggingface_hub
    if hasattr(huggingface_hub, 'constants'):
        huggingface_hub.constants.HUGGINGFACE_CO_URL_HOME = "https://hf-mirror.com"
    # 新版本的设置方式
    if hasattr(huggingface_hub, 'utils') and hasattr(huggingface_hub.utils, '_runtime_constants'):
        huggingface_hub.utils._runtime_constants['HUGGINGFACE_CO_URL_HOME'] = "https://hf-mirror.com"
except Exception as e:
    print(f"设置镜像源时出现警告: {e}")
    pass

def transcribe_audio(audio_path, output_path):
    try:
        # 尝试多种模型初始化方式
        model = None
        
        # 方式1: 优先尝试使用国内镜像下载base模型
        try:
            print("尝试通过国内镜像下载base模型...")
            model = WhisperModel("base", device="cpu", local_files_only=False)
        except Exception as e1:
            print(f"国内镜像下载base模型失败: {e1}")
            
            # 方式2: 尝试使用本地缓存的base模型
            try:
                print("尝试使用本地缓存的base模型...")
                model = WhisperModel("base", device="cpu", local_files_only=True)
            except Exception as e2:
                print(f"本地缓存base模型也失败: {e2}")
                print("❌ 无法加载base模型，请检查网络连接或手动下载模型")
                print("💡 解决方案:")
                print("   1. 确保网络连接正常")
                print("   2. 运行 python3 download_whisper_offline.py 手动下载模型")
                print("   3. 或者使用有外网的机器下载后拷贝模型文件")
                raise Exception(f"无法加载base模型: 在线下载失败({e1}), 本地缓存失败({e2})")
        
        if model is None:
            raise Exception("无法初始化任何Whisper模型")
        
        # 转录音频
        segments, info = model.transcribe(audio_path, language="zh")
        
        # 生成SRT格式字幕
        with open(output_path, 'w', encoding='utf-8') as f:
            for i, segment in enumerate(segments, 1):
                start_time = format_time(segment.start)
                end_time = format_time(segment.end)
                text = segment.text.strip()
                
                f.write(f"{i}\\n")
                f.write(f"{start_time} --> {end_time}\\n")
                f.write(f"{text}\\n\\n")
        
        print(f"字幕生成成功: {output_path}")
        return True
    except Exception as e:
        print(f"转录失败: {e}", file=sys.stderr)
        return False

def format_time(seconds):
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    msecs = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{msecs:03d}"

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python script.py <audio_path> <output_path>", file=sys.stderr)
        sys.exit(1)
    
    audio_path = sys.argv[1]
    output_path = sys.argv[2]
    
    success = transcribe_audio(audio_path, output_path)
    sys.exit(0 if success else 1)
      `
      
      const scriptPath = path.join(outputDir, 'whisper_transcribe.py')
      fs.writeFileSync(scriptPath, pythonScript)
      
      // 执行Python脚本
      const pythonProcess = spawn('python3', [scriptPath, audioPath, srtPath])

      let stdout = ''
      let stderr = ''

      pythonProcess.stdout?.on('data', (data) => {
        stdout += data.toString()
        console.log(`Whisper输出: ${data.toString().trim()}`)
      })

      pythonProcess.stderr?.on('data', (data) => {
        stderr += data.toString()
        console.error(`Whisper错误: ${data.toString().trim()}`)
      })

      pythonProcess.on('close', async (code) => {
        // 清理临时脚本
        try {
          await fs.remove(scriptPath)
        } catch (e) {
          console.warn('清理临时脚本失败:', e)
        }

        if (code === 0) {
          // 检查SRT文件是否生成
          if (await fs.pathExists(srtPath)) {
            console.log(`faster-whisper字幕生成成功: ${srtPath}`)
            resolve(srtPath)
          } else {
            console.error('faster-whisper执行成功但未找到SRT文件')
            reject(new Error('SRT文件未生成'))
          }
        } else {
          console.error(`faster-whisper执行失败，退出码: ${code}`)
          console.error(`错误信息: ${stderr}`)
          reject(new Error(`faster-whisper执行失败: ${stderr}`))
        }
      })

      pythonProcess.on('error', (error) => {
        console.error('Python进程启动失败:', error)
        reject(new Error(`Python进程启动失败: ${error.message}`))
      })
    })
  }

  /**
   * 从视频中提取音频并生成字幕
   */
  async generateSubtitleFromVideo(videoPath: string, outputDir: string): Promise<string> {
    try {
      // 1. 从视频提取音频
      const audioPath = await this.extractAudioFromVideo(videoPath, outputDir)
      
      // 2. 使用提取的音频生成字幕
      const subtitlePath = await this.generateSubtitleFromAudio(audioPath, outputDir)
      
      // 3. 清理临时音频文件
      await fs.remove(audioPath)
      
      return subtitlePath
    } catch (error) {
      console.error('从视频生成字幕失败:', error)
      throw error
    }
  }

  /**
   * 从视频中提取音频
   */
  private async extractAudioFromVideo(videoPath: string, outputDir: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const outputName = path.basename(videoPath, path.extname(videoPath))
      const audioPath = path.join(outputDir, `${outputName}_audio.wav`)
      
      console.log(`从视频提取音频: ${videoPath} -> ${audioPath}`)
      
      // 使用FFmpeg提取音频
      const ffmpegProcess = spawn('ffmpeg', [
        '-i', videoPath,
        '-vn',  // 不处理视频
        '-acodec', 'pcm_s16le',  // WAV格式，适合Whisper
        '-ar', '16000',  // 16kHz采样率，Whisper推荐
        '-ac', '1',  // 单声道
        '-y',  // 覆盖输出文件
        audioPath
      ])

      let stderr = ''

      ffmpegProcess.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      ffmpegProcess.on('close', async (code) => {
        if (code === 0 && await fs.pathExists(audioPath)) {
          console.log(`音频提取成功: ${audioPath}`)
          resolve(audioPath)
        } else {
          console.error(`音频提取失败，退出码: ${code}`)
          console.error(`错误信息: ${stderr}`)
          reject(new Error(`音频提取失败: ${stderr}`))
        }
      })

      ffmpegProcess.on('error', (error) => {
        console.error('FFmpeg进程启动失败:', error)
        reject(new Error(`FFmpeg进程启动失败: ${error.message}`))
      })
    })
  }

  /**
   * 检查faster-whisper是否可用
   */
  async checkWhisperAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const pythonScript = 'try:\n    from faster_whisper import WhisperModel\n    print("faster-whisper available")\nexcept ImportError:\n    exit(1)'
      const pythonProcess = spawn('python3', ['-c', pythonScript])
      
      pythonProcess.on('close', (code) => {
        resolve(code === 0)
      })

      pythonProcess.on('error', () => {
        resolve(false)
      })
    })
  }

  /**
   * 生成字幕（别名方法，兼容其他服务调用）
   */
  async generateSubtitles(audioPath: string, outputPath: string, language: string = 'zh'): Promise<void> {
    const outputDir = path.dirname(outputPath)
    const subtitlePath = await this.generateSubtitleFromAudio(audioPath, outputDir)
    
    // 如果生成的路径和期望的输出路径不同，需要移动文件
    if (subtitlePath !== outputPath) {
      await fs.move(subtitlePath, outputPath)
    }
  }
}