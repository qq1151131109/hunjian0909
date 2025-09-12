import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import fs from 'fs-extra'
import { promisify } from 'util'
import { spawn } from 'child_process'

// 设置 FFmpeg 路径（如果需要）
if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH)
}
if (process.env.FFPROBE_PATH) {
  ffmpeg.setFfprobePath(process.env.FFPROBE_PATH)
}

export class FFmpegService {
  
  /**
   * 获取视频信息
   */
  async getVideoInfo(inputPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
          reject(err)
        } else {
          resolve(metadata)
        }
      })
    })
  }

  /**
   * 获取视频时长（秒）
   */
  async getVideoDuration(inputPath: string): Promise<number> {
    const metadata = await this.getVideoInfo(inputPath)
    return metadata.format.duration || 0
  }

  /**
   * 获取音频文件时长（秒）
   */
  async getAudioDuration(inputPath: string): Promise<number> {
    const metadata = await this.getVideoInfo(inputPath)
    return metadata.format.duration || 0
  }

  /**
   * 获取视频文件的音频时长（秒）
   * 如果视频没有音频轨道，返回 0
   */
  async getVideoAudioDuration(inputPath: string): Promise<number> {
    try {
      const metadata = await this.getVideoInfo(inputPath)
      
      // 检查是否有音频流
      const audioStreams = metadata.streams?.filter((stream: any) => stream.codec_type === 'audio')
      
      if (!audioStreams || audioStreams.length === 0) {
        console.log(`视频 ${inputPath} 没有音频轨道`)
        return 0
      }

      // 获取第一个音频流的时长
      const audioDuration = audioStreams[0].duration || metadata.format.duration || 0
      console.log(`视频 ${inputPath} 音频时长: ${audioDuration}秒`)
      return audioDuration
      
    } catch (error) {
      console.error(`获取视频音频时长失败: ${inputPath}`, error)
      return 0
    }
  }

  /**
   * 按指定时长裁切视频，返回所有片段路径
   */
  async cutVideoByDuration(inputPath: string, segmentDuration: number, outputDir: string): Promise<string[]> {
    try {
      const totalDuration = await this.getVideoDuration(inputPath)
      const numSegments = Math.floor(totalDuration / segmentDuration)
      
      if (numSegments === 0) {
        console.log(`视频时长 ${totalDuration}s 小于目标时长 ${segmentDuration}s，跳过处理`)
        return []
      }

      const segments: string[] = []

      // 生成每个片段
      for (let i = 0; i < numSegments; i++) {
        // 对所有片段都添加0.2秒的偏移，避免黑帧问题
        const baseStartTime = i * segmentDuration
        const offset = 0.2 // 统一的小偏移，避免黑帧
        const startTime = baseStartTime + offset
        const actualDuration = segmentDuration - offset
        
        // 确保不会超出视频总时长
        if (startTime + actualDuration > totalDuration) {
          console.log(`跳过片段 ${i}：起始时间 ${startTime}s + 时长 ${actualDuration}s 超出总时长 ${totalDuration}s`)
          continue
        }
        
        const outputPath = path.join(outputDir, `segment_${i}.mp4`)
        
        await this.cutVideoSegment(inputPath, startTime, actualDuration, outputPath)
        segments.push(outputPath)
      }

      console.log(`视频裁切完成，生成 ${segments.length} 个片段`)
      return segments

    } catch (error) {
      console.error('视频裁切失败:', error)
      throw error
    }
  }

  /**
   * 裁切单个视频片段
   */
  private async cutVideoSegment(inputPath: string, startTime: number, duration: number, outputPath: string): Promise<void> {
    console.log(`切割视频片段: 起始时间=${startTime}s, 时长=${duration}s`)
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .inputOptions([
          '-accurate_seek',  // 精确定位
          '-avoid_negative_ts', 'make_zero'  // 避免负时间戳
        ])
        .seekInput(startTime)
        .duration(duration)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-preset fast',
          '-crf 23',
          '-movflags +faststart',
          // 确保从关键帧开始编码，减少黑帧
          '-sc_threshold 0',
          // 强制关键帧间隔
          '-g 30',
          // 像素格式兼容性
          '-pix_fmt yuv420p'
        ])
        .output(outputPath)
        .on('end', () => {
          console.log(`片段生成完成: ${outputPath}`)
          resolve()
        })
        .on('error', (err) => {
          console.error(`片段生成失败: ${outputPath}`, err)
          reject(err)
        })
        .run()
    })
  }

  /**
   * 为视频添加音频轨道
   */
  async addAudioToVideo(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          '-c:v copy', // 保持视频编码不变
          '-c:a aac',  // 音频编码为AAC
          '-map 0:v:0', // 使用第一个输入的视频流
          '-map 1:a:0', // 使用第二个输入的音频流
          '-shortest',  // 以最短的流为准
          '-movflags +faststart'
        ])
        .output(outputPath)
        .on('end', () => {
          console.log(`音频添加完成: ${outputPath}`)
          resolve()
        })
        .on('error', (err) => {
          console.error(`音频添加失败: ${outputPath}`, err)
          reject(err)
        })
        .run()
    })
  }

  /**
   * 根据前端自定义设置生成ASS force_style参数
   */
  private generateCustomSubtitleStyle(settings: any): string {
    try {
      console.log('处理自定义字幕设置:', JSON.stringify(settings, null, 2))
      
      // 参数验证
      if (!settings || typeof settings !== 'object') {
        throw new Error('Invalid settings object')
      }
      
      // 颜色转换：从 #RRGGBB 转换为 &H00BBGGRR
      const hexToAss = (hex: string) => {
        if (!hex || !hex.startsWith('#')) return '&H00ffffff'
        const r = hex.substring(1, 3)
        const g = hex.substring(3, 5) 
        const b = hex.substring(5, 7)
        return `&H00${b}${g}${r}`
      }

      // 位置到ASS对齐值（仅三档）
      // ASS Alignment: 2=中下, 5=中中, 8=中上
      const positionToAlignment = (position: string) => {
        console.log('映射位置:', position)
        switch (position) {
          case 'top-center': return 8
          case 'center-center': return 5
          case 'bottom-center':
          default: return 2
        }
      }

      // 计算垂直边距（仅三档）
      const getMarginV = (position: string, marginVertical: number | undefined) => {
        console.log('计算边距 - 位置:', position, '边距:', marginVertical)
        // 默认：top-center=80, center-center=0, bottom-center=50
        const defaultMargin = position === 'top-center' ? 80 : position === 'center-center' ? 0 : 50
        const margin = (typeof marginVertical === 'number') ? marginVertical : defaultMargin
        switch (position) {
          case 'top-center':
            return margin
          case 'center-center':
            return 0
          case 'bottom-center':
          default:
            return margin
        }
      }

      // 生成ASS样式
      const fontSize = settings.fontSize || 20
      const color = settings.color || '#ffffff'
      const position = settings.position || 'bottom-center'
      const marginVertical = settings.marginVertical
      const marginHorizontal = settings.marginHorizontal || 0  // 默认不设置水平边距，让居中自然生效
      const outline = settings.outline !== false  // 默认启用描边
      const outlineWidth = settings.outlineWidth || 2
      
      console.log('字幕样式参数:', { fontSize, color, position, marginVertical, marginHorizontal, outline, outlineWidth })
      
      // 基础样式：字体和颜色
      let forceStyle = `FontName=Arial,FontSize=${fontSize},PrimaryColour=${hexToAss(color)},Bold=1`
      
      // 设置对齐方式 - 确保居中
      const alignment = positionToAlignment(position)
      forceStyle += `,Alignment=${alignment}`
      console.log('使用对齐值:', alignment)
      
      // 设置垂直边距
      const marginV = getMarginV(position, marginVertical)
      if (marginV > 0) {
        forceStyle += `,MarginV=${marginV}`
        console.log('应用垂直边距:', marginV)
      }
      
      // 强制水平居中：不设置任何水平边距
      console.log('强制水平居中，不使用MarginL/MarginR')
      
      // 换行策略：确保多行时按空格优先换行，不影响水平居中
      forceStyle += `,WrapStyle=2`

      // 描边设置
      if (outline) {
        forceStyle += `,Outline=${outlineWidth}`
        forceStyle += `,OutlineColour=&H00000000`
        console.log('应用描边:', outlineWidth)
      } else {
        forceStyle += `,Outline=0`
        console.log('禁用描边')
      }
      
      console.log('✅ 生成的ASS force_style:', forceStyle)
      return forceStyle
      
    } catch (error) {
      console.error('❌ generateCustomSubtitleStyle 执行失败:', error)
      throw error  // 重新抛出错误以便上层处理
    }
  }

  /**
   * 将 SRT/VTT 转换为 ASS 文件
   */
  private async convertTextSubtitleToAss(inputSubtitlePath: string, outputAssPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', ['-y', '-i', inputSubtitlePath, outputAssPath])
      let stderr = ''
      proc.stderr?.on('data', (d) => { stderr += d.toString() })
      proc.on('close', async (code) => {
        if (code === 0 && await fs.pathExists(outputAssPath)) {
          resolve()
        } else {
          reject(new Error(`字幕转换为ASS失败: ${stderr}`))
        }
      })
      proc.on('error', (err) => reject(err))
    })
  }

  /**
   * 修改 ASS 样式，强制对齐与样式参数
   */
  private async rewriteAssStyle(assPath: string, options: { alignment: number, marginV: number, fontSize: number, colorAss: string, outline: number, playRes?: { w: number, h: number } }): Promise<void> {
    const content = await fs.readFile(assPath, 'utf8')
    const lines = content.split(/\r?\n/)
    const newLines: string[] = []
    let inStylesSection = false
    let inEventsSection = false
    let styleFormatFields: string[] = []
    let eventsFormatFields: string[] = []
    let eventsTextIndex = -1
    let eventsMarginVIndex = -1
    let eventsStyleIndex = -1
    let hasPlayResX = false
    let hasPlayResY = false
    let injectedPlayRes = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // 记录 Script Info 段中的 PlayRes 存在性
      if (!inStylesSection) {
        if (line.startsWith('PlayResX=')) hasPlayResX = true
        if (line.startsWith('PlayResY=')) hasPlayResY = true
      }

      // 命中 [Script Info]
      if (line === '[Script Info]') {
        newLines.push(line)
        // 紧随其后写入 PlayRes（总是以当前视频分辨率覆盖）
        if (options.playRes && !injectedPlayRes) {
          newLines.push(`PlayResX=${options.playRes.w}`)
          newLines.push(`PlayResY=${options.playRes.h}`)
          newLines.push('WrapStyle=2')
          injectedPlayRes = true
        }
        continue
      }

      // 进入样式段
      if (line === '[V4+ Styles]') {
        inStylesSection = true
        inEventsSection = false
        newLines.push(line)
        continue
      }

      // 样式段的格式行
      if (inStylesSection && line.startsWith('Format:')) {
        styleFormatFields = line.replace('Format:', '').split(',').map(s => s.trim())
        newLines.push(line)
        continue
      }

      // 样式行重写
      if (inStylesSection && line.startsWith('Style:')) {
        const values = line.replace('Style:', '').split(',').map(s => s.trim())
        const dict: Record<string, string> = {}
        for (let j = 0; j < Math.min(styleFormatFields.length, values.length); j++) {
          dict[styleFormatFields[j]] = values[j]
        }
        dict['Alignment'] = String(options.alignment)
        dict['MarginV'] = String(options.marginV || 0)
        dict['MarginL'] = '0'
        dict['MarginR'] = '0'
        if (dict['Fontsize'] !== undefined) dict['Fontsize'] = String(options.fontSize)
        if (dict['Outline'] !== undefined) dict['Outline'] = String(options.outline)
        if (dict['PrimaryColour'] !== undefined) dict['PrimaryColour'] = options.colorAss
        if (dict['Bold'] !== undefined) dict['Bold'] = '1'
        const rebuilt = 'Style: ' + styleFormatFields.map(k => dict[k] ?? '').join(',')
        newLines.push(rebuilt)
        continue
      }

      // 进入事件段
      if (line === '[Events]') {
        inEventsSection = true
        inStylesSection = false
        newLines.push(line)
        continue
      }

      // 事件格式行
      if (inEventsSection && line.startsWith('Format:')) {
        eventsFormatFields = line.replace('Format:', '').split(',').map(s => s.trim())
        eventsTextIndex = eventsFormatFields.findIndex(f => f.toLowerCase() === 'text')
        eventsMarginVIndex = eventsFormatFields.findIndex(f => f.toLowerCase() === 'marginv')
        eventsStyleIndex = eventsFormatFields.findIndex(f => f.toLowerCase() === 'style')
        newLines.push(line)
        continue
      }

      // 对话行重写：移除 {\anX} 并强制注入 {\anN}
      if (inEventsSection && line.startsWith('Dialogue:')) {
        if (eventsTextIndex >= 0) {
          const head = 'Dialogue:'
          const rest = line.substring(head.length).trim()
          // 按逗号分割到 Text 字段（保留 Text 中可能的逗号）
          const parts = rest.split(',')
          const fixedParts: string[] = []
          for (let j = 0; j < eventsTextIndex; j++) fixedParts.push(parts[j] || '')
          const text = parts.slice(eventsTextIndex).join(',')
          const cleaned = text
            .replace(/\{\\an\d+[^}]*\}/gi, '')
            .replace(/\{\\a\d+[^}]*\}/gi, '')
            .replace(/\{\\pos\([^}]*\)\}/gi, '')
            .replace(/\{\\move\([^}]*\)\}/gi, '')
          let override = `{\\an${options.alignment}}`
          // 统一使用 Default 样式，避免使用未被重写的样式
          if (eventsStyleIndex >= 0 && fixedParts.length > eventsStyleIndex) {
            fixedParts[eventsStyleIndex] = 'Default'
          }
          // 顶部居中：设置事件级 MarginV（避免 \pos 造成越界），并预留字高
          if (options.alignment === 8) {
            if (eventsMarginVIndex >= 0) {
              const baseMargin = Math.max(0, options.marginV || 0)
              const ascentPadding = Math.ceil((options.fontSize || 20) * 1.0)
              const y = Math.max(1, baseMargin + ascentPadding)
              fixedParts[eventsMarginVIndex] = String(y)
            }
          }
          const rebuilt = `${head} ${[...fixedParts, override + cleaned].join(',')}`
          newLines.push(rebuilt)
          continue
        }
      }

      newLines.push(line)
    }

    await fs.writeFile(assPath, newLines.join('\n'))
  }

  /**
   * 为视频添加字幕
   */
  async addSubtitleToVideo(videoPath: string, subtitlePath: string, outputPath: string, styleId?: string, customSettings?: any): Promise<void> {
    // 探测视频分辨率，供 libass original_size 使用，避免位置偏移
    let playRes = '720x1280'
    try {
      const metadata: any = await this.getVideoInfo(videoPath)
      const v = metadata?.streams?.find((s: any) => s.codec_type === 'video')
      if (v?.width && v?.height) {
        playRes = `${v.width}x${v.height}`
      }
    } catch (e) {
      console.warn('获取视频分辨率失败，使用默认 720x1280')
    }
    return new Promise((resolve, reject) => {
      const subtitleExt = path.extname(subtitlePath).toLowerCase()
      
      let subtitleFilter: string
      
      const buildFilter = async (): Promise<void> => {
        if (subtitleExt === '.srt' || subtitleExt === '.vtt') {
          // 将文本字幕转换为 ASS，并直接在 ASS 中重写样式，避免 force_style 失效
          const tempDir = path.dirname(videoPath)
          const assPath = path.join(tempDir, `__converted_${Date.now()}.ass`)
          try {
            await this.convertTextSubtitleToAss(subtitlePath, assPath)

            const pos = (customSettings?.position) || 'bottom-center'
            const alignment = pos === 'top-center' ? 8 : pos === 'center-center' ? 5 : 2
            const marginV = (pos === 'center-center') ? 0 : (typeof customSettings?.marginVertical === 'number' ? customSettings.marginVertical : (pos === 'top-center' ? 80 : 50))
            const fontSize = customSettings?.fontSize || 20
            const colorHex = customSettings?.color || '#ffffff'
            const outlineWidth = customSettings?.outline ? (customSettings.outlineWidth || 2) : 0
            const hexToAss = (hex: string) => {
              if (!hex || !hex.startsWith('#')) return '&H00ffffff'
              const r = hex.substring(1, 3)
              const g = hex.substring(3, 5)
              const b = hex.substring(5, 7)
              return `&H00${b}${g}${r}`
            }
            const colorAss = hexToAss(colorHex)
            const [pw, ph] = playRes.split('x').map(n => parseInt(n, 10))

            await this.rewriteAssStyle(assPath, {
              alignment,
              marginV,
              fontSize,
              colorAss,
              outline: outlineWidth,
              playRes: { w: pw || 1080, h: ph || 1920 }
            })

            subtitleFilter = `ass='${assPath.replace(/'/g, "\\'") }'`
          } catch (error) {
            console.error('❌ 文本字幕→ASS 处理失败，回退到 force_style 方法:', error)
            if (customSettings) {
              try {
                const fullStyle = this.generateCustomSubtitleStyle(customSettings)
                subtitleFilter = `subtitles='${subtitlePath.replace(/'/g, "\\'") }':original_size=${playRes}:force_style='${fullStyle}'`
              } catch {
                subtitleFilter = `subtitles='${subtitlePath.replace(/'/g, "\\'") }'`
              }
            } else {
              const defaultStyle = `FontName=Arial,FontSize=20,PrimaryColour=&H00ffffff,Alignment=5`
              subtitleFilter = `subtitles='${subtitlePath.replace(/'/g, "\\'") }':original_size=${playRes}:force_style='${defaultStyle}'`
            }
          }
        } else if (subtitleExt === '.ass' || subtitleExt === '.ssa') {
          // ASS/SSA 字幕
          subtitleFilter = `ass='${subtitlePath.replace(/'/g, "\\'") }'`
        } else {
          throw new Error(`不支持的字幕格式: ${subtitleExt}`)
        }
      }

      buildFilter().then(() => {
        // ASS/SSA 字幕
        const ffmpegCommand = ffmpeg(videoPath)
          .videoFilters(subtitleFilter)
          .videoCodec('libx264')
          .audioCodec('copy') // 保持音频不变
          .outputOptions([
            '-preset fast',
            '-crf 23',
            '-movflags +faststart',
            // 去除旋转元数据，避免某些播放器应用显示矩阵后导致位置错位
            '-metadata:s:v:0', 'rotate=0'
          ])
          .output(outputPath)
          .on('start', (commandLine) => {
            console.log('🔍 完整的FFmpeg命令:')
            console.log(commandLine)
          })
          .on('end', () => {
            console.log(`✅ 字幕添加完成: ${outputPath}`)
            resolve()
          })
          .on('error', (err) => {
            console.error(`❌ 字幕添加失败: ${outputPath}`, err)
            // 如果字幕添加失败，尝试复制原视频
            fs.copy(videoPath, outputPath).then(() => {
              console.log('字幕添加失败，使用原视频')
              resolve()
            }).catch(reject)
          })
        
        ffmpegCommand.run()
      }).catch((err) => {
        if (err && err.message && /不支持的字幕格式/.test(err.message)) {
          reject(err)
        } else {
          console.error('构建字幕滤镜失败，回退复制原视频:', err)
          fs.copy(videoPath, outputPath).then(() => resolve()).catch(reject)
        }
      })
    })
  }

  /**
   * 标准化视频格式，确保拼接兼容性 - TikTok竖屏格式
   */
  async normalizeVideo(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .fps(30)            // 标准化为30fps
        .audioFrequency(44100) // 标准化音频采样率
        .outputOptions([
          '-preset fast',
          '-crf 23',
          '-pix_fmt yuv420p',
          '-movflags +faststart',
          '-avoid_negative_ts make_zero',
          // 智能缩放到720x1280，保持宽高比，用黑边填充
          `-vf scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black`,
          // 确保关键帧设置
          '-g 30',
          '-keyint_min 30'
        ])
        .output(outputPath)
        .on('end', () => {
          console.log(`视频标准化完成(720x1280): ${outputPath}`)
          resolve()
        })
        .on('error', (err) => {
          console.error(`视频标准化失败: ${outputPath}`, err)
          reject(err)
        })
        .run()
    })
  }

  /**
   * 拼接多个视频 - 先标准化再拼接
   */
  async concatenateVideos(videoPaths: string[], outputPath: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      if (videoPaths.length === 0) {
        reject(new Error('没有视频文件需要拼接'))
        return
      }

      if (videoPaths.length === 1) {
        // 只有一个视频，直接复制
        fs.copy(videoPaths[0], outputPath).then(resolve).catch(reject)
        return
      }

      try {
        console.log(`开始标准化 ${videoPaths.length} 个视频...`)
        
        const tempDir = path.dirname(outputPath)
        const normalizedPaths: string[] = []
        
        // 先标准化所有视频
        for (let i = 0; i < videoPaths.length; i++) {
          const normalizedPath = path.join(tempDir, `normalized_${i}_${Date.now()}.mp4`)
          await this.normalizeVideo(videoPaths[i], normalizedPath)
          normalizedPaths.push(normalizedPath)
        }

        console.log('视频标准化完成，开始拼接...')

        // 使用 concat demuxer 方法拼接标准化后的视频
        const listFile = path.join(tempDir, `concat_list_${Date.now()}.txt`)
        // 确保目录存在
        await fs.ensureDir(tempDir)
        // 使用相对于列表文件的相对路径
        const fileList = normalizedPaths.map(videoPath => {
          const relativePath = path.relative(tempDir, videoPath)
          return `file '${relativePath}'`
        }).join('\n')
        await fs.writeFile(listFile, fileList)
        
        console.log(`创建拼接列表文件: ${listFile}`)
        console.log(`文件内容:\n${fileList}`)

        const command = ffmpeg()
          .input(listFile)
          .inputOptions(['-f concat', '-safe 0'])
          .outputOptions(['-c copy']) // 因为已经标准化，直接复制流
          .output(outputPath)
          .on('end', async () => {
            // 清理临时文件
            try {
              await fs.remove(listFile)
              for (const normalizedPath of normalizedPaths) {
                await fs.remove(normalizedPath)
              }
            } catch (e) {
              console.warn('清理临时文件失败:', e)
            }
            console.log(`视频拼接完成: ${outputPath}`)
            resolve()
          })
          .on('error', async (err) => {
            // 检查文件是否存在
            try {
              const listExists = await fs.pathExists(listFile)
              console.error(`拼接列表文件是否存在: ${listExists}`)
              if (listExists) {
                const content = await fs.readFile(listFile, 'utf8')
                console.error(`拼接列表文件内容:\n${content}`)
              }
              
              // 检查每个输入文件是否存在
              for (let i = 0; i < normalizedPaths.length; i++) {
                const exists = await fs.pathExists(normalizedPaths[i])
                console.error(`标准化文件 ${i} (${normalizedPaths[i]}) 是否存在: ${exists}`)
              }
            } catch (checkErr) {
              console.error('检查文件状态失败:', checkErr)
            }
            
            // 清理临时文件
            try {
              await fs.remove(listFile)
              for (const normalizedPath of normalizedPaths) {
                await fs.remove(normalizedPath)
              }
            } catch (e) {
              console.warn('清理临时文件失败:', e)
            }
            console.error(`视频拼接失败: ${outputPath}`, err)
            reject(err)
          })
          .run()

      } catch (error) {
        console.error('拼接视频时发生错误:', error)
        reject(error)
      }
    })
  }

  /**
   * 检查视频是否包含音频流
   */
  private async checkVideosForAudio(videoPaths: string[]): Promise<boolean[]> {
    const promises = videoPaths.map(async (videoPath) => {
      try {
        const metadata = await this.getVideoInfo(videoPath)
        const audioStreams = metadata.streams?.filter((stream: any) => stream.codec_type === 'audio')
        return audioStreams && audioStreams.length > 0
      } catch (error) {
        console.error(`检查视频音频流失败: ${videoPath}`, error)
        return false
      }
    })
    return Promise.all(promises)
  }

  /**
   * 调整视频分辨率和码率（可选功能）
   */
  async resizeVideo(inputPath: string, outputPath: string, width: number, height: number): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .size(`${width}x${height}`)
        .aspect('16:9')
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-preset fast',
          '-crf 23',
          '-movflags +faststart'
        ])
        .output(outputPath)
        .on('end', () => {
          console.log(`视频调整完成: ${outputPath}`)
          resolve()
        })
        .on('error', (err) => {
          console.error(`视频调整失败: ${outputPath}`, err)
          reject(err)
        })
        .run()
    })
  }

  /**
   * 从视频中提取音频
   */
  async extractAudio(videoPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioBitrate('192k')
        .output(outputPath)
        .on('end', () => {
          console.log(`音频提取完成: ${outputPath}`)
          resolve()
        })
        .on('error', (err) => {
          console.error(`音频提取失败: ${outputPath}`, err)
          reject(err)
        })
        .run()
    })
  }

  /**
   * 合并音频与视频
   */
  async mergeAudioWithVideo(videoPath: string, audioPath: string, outputPath: string, videoDuration?: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          '-c:v copy',
          '-c:a aac',
          '-map 0:v:0',
          '-map 1:a:0',
          '-shortest'
        ])

      if (videoDuration) {
        command.duration(videoDuration)
      }

      command
        .output(outputPath)
        .on('end', () => {
          console.log(`音频视频合并完成: ${outputPath}`)
          resolve()
        })
        .on('error', (err) => {
          console.error(`音频视频合并失败: ${outputPath}`, err)
          reject(err)
        })
        .run()
    })
  }

  /**
   * 音频标准化处理
   */
  async normalizeAudio(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('libmp3lame')
        .audioBitrate('192k')
        .audioFrequency(44100)
        .audioChannels(2)
        .audioFilters(['loudnorm'])
        .output(outputPath)
        .on('end', () => {
          console.log(`音频标准化完成: ${outputPath}`)
          resolve()
        })
        .on('error', (err) => {
          console.error(`音频标准化失败: ${outputPath}`, err)
          reject(err)
        })
        .run()
    })
  }

  /**
   * 按时长裁切视频
   */
  async cutVideo(inputPath: string, outputPath: string, duration: number): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .duration(duration)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-preset fast',
          '-crf 23',
          '-movflags +faststart'
        ])
        .output(outputPath)
        .on('end', () => {
          console.log(`视频裁切完成: ${outputPath}`)
          resolve()
        })
        .on('error', (err) => {
          console.error(`视频裁切失败: ${outputPath}`, err)
          reject(err)
        })
        .run()
    })
  }

  /**
   * 为视频添加字幕（别名方法）
   */
  async addSubtitles(videoPath: string, subtitlePath: string, outputPath: string, subtitleStyle?: any): Promise<void> {
    const styleId = subtitleStyle?.styleId || subtitleStyle?.name || 'default'
    return this.addSubtitleToVideo(videoPath, subtitlePath, outputPath, styleId)
  }

  /**
   * 视频优化处理
   */
  async optimizeVideo(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-preset medium',
          '-crf 23',
          '-movflags +faststart',
          '-pix_fmt yuv420p'
        ])
        .output(outputPath)
        .on('end', () => {
          console.log(`视频优化完成: ${outputPath}`)
          resolve()
        })
        .on('error', (err) => {
          console.error(`视频优化失败: ${outputPath}`, err)
          reject(err)
        })
        .run()
    })
  }
}