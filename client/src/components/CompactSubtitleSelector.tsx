import React, { useState, useEffect } from 'react'
import { Card, Row, Col, Select, Slider, Switch, Divider, Typography } from 'antd'
import { BgColorsOutlined } from '@ant-design/icons'
import { SubtitleSettings } from '../types/subtitle'
import { subtitleStyles } from '../../../shared/subtitleStyles'

const { Text } = Typography
const { Option } = Select

interface CompactSubtitleSelectorProps {
  value: string
  onChange: (styleId: string, settings: SubtitleSettings) => void
}

// 辅助函数：计算顶部内边距（仅三档位置）
const getPaddingTop = (position: string, margin: number): number => {
  switch (position) {
    case 'top-center': return Math.max(margin * 0.4, 4)
    case 'center-center': return 0
    case 'bottom-center': return 0
    default: return 0
  }
}

// 辅助函数：计算底部内边距（仅三档位置）
const getPaddingBottom = (position: string, margin: number): number => {
  switch (position) {
    case 'top-center': return 0
    case 'center-center': return 0
    case 'bottom-center': return Math.max(margin * 0.4, 4)
    default: return 0
  }
}

const CompactSubtitleSelector: React.FC<CompactSubtitleSelectorProps> = React.memo(({ value, onChange }) => {
  // 状态管理
  const [customSettings, setCustomSettings] = useState<SubtitleSettings>(() => {
    const saved = localStorage.getItem('subtitleSettings')
    if (saved) {
      const parsed = JSON.parse(saved)
      // 兼容旧值：top/center/bottom -> 映射到三档
      const legacy = parsed?.position
      const mapped = legacy === 'top' ? 'top-center' : legacy === 'center' ? 'center-center' : legacy === 'bottom' ? 'bottom-center' : legacy
      return { ...parsed, position: mapped || 'bottom-center' }
    }
    
    // 默认设置
    return {
      styleId: value,
      fontSize: 20,
      position: 'bottom-center' as const,
      marginVertical: 50,
      marginHorizontal: 0,  // 默认不设置水平边距，保持居中
      color: '#ffffff',
      outline: true,
      outlineWidth: 2
    }
  })

  // 保存到localStorage
  useEffect(() => {
    localStorage.setItem('subtitleSettings', JSON.stringify(customSettings))
  }, [customSettings])

  // 组件首次挂载时主动调用onChange，确保自定义设置传递给父组件
  useEffect(() => {
    onChange(customSettings.styleId, customSettings)
  }, []) // 空依赖数组，只在挂载时执行一次

  // 样式改变处理
  const handleStyleChange = (styleId: string) => {
    const style = subtitleStyles.find(s => s.id === styleId)
    if (style) {
      const newSettings: SubtitleSettings = {
        styleId,
        fontSize: style.defaultSettings.fontSize || style.fontSize || customSettings.fontSize,
        position: style.position || customSettings.position,  // 使用预设样式的位置
        marginVertical: style.marginVertical || customSettings.marginVertical,  // 使用预设样式的边距
        marginHorizontal: style.marginHorizontal || customSettings.marginHorizontal,
        color: style.defaultSettings.color || style.color || customSettings.color,
        outline: style.defaultSettings.outline ?? style.outline ?? customSettings.outline,
        outlineWidth: style.defaultSettings.outlineWidth || style.outlineWidth || customSettings.outlineWidth
      }
      setCustomSettings(newSettings)
      onChange(styleId, newSettings)
    }
  }

  // 更新自定义设置
  const updateSettings = (updates: Partial<SubtitleSettings>) => {
    // 自动选择合理默认边距：top-center=80, center-center=0, bottom-center=50
    let next = { ...customSettings, ...updates }
    if (updates.position && (updates.marginVertical === undefined)) {
      const autoMargin = updates.position === 'top-center' ? 80 : updates.position === 'center-center' ? 0 : 50
      next = { ...next, marginVertical: autoMargin }
    }
    const newSettings = next
    setCustomSettings(newSettings)
    onChange(newSettings.styleId, newSettings)
  }

  const selectedStyle = subtitleStyles.find(s => s.id === customSettings.styleId) || subtitleStyles[0]

  return (
    <Card 
      size="small" 
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BgColorsOutlined />
          <span>字幕样式</span>
        </div>
      }
      style={{ marginBottom: 16 }}
    >
      {/* 样式选择和实时预览 */}
      <Row gutter={16} style={{ marginBottom: 12 }}>
        <Col span={12}>
          <Text strong style={{ fontSize: 12 }}>预设样式</Text>
          <Select 
            value={customSettings.styleId}
            onChange={handleStyleChange}
            style={{ width: '100%', marginTop: 4 }}
          >
            {subtitleStyles.map(style => (
              <Option key={style.id} value={style.id}>
                {style.name}
              </Option>
            ))}
          </Select>
        </Col>
        <Col span={12}>
          <Text strong style={{ fontSize: 12 }}>实时预览</Text>
          <div 
            style={{
              width: '100%',
              height: 60,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: 4,
              position: 'relative',
              display: 'flex',
              alignItems: customSettings.position === 'center-center' ? 'center' :
                         customSettings.position === 'top-center' ? 'flex-start' : 'flex-end',
              justifyContent: 'center',
              padding: `${getPaddingTop(customSettings.position, customSettings.marginVertical)}px 8px ${getPaddingBottom(customSettings.position, customSettings.marginVertical)}px 8px`,
              marginTop: 4
            }}
          >
            <span
              style={{
                fontSize: `${Math.max(customSettings.fontSize * 0.6, 8)}px`,
                color: customSettings.color,
                fontFamily: selectedStyle.fontFamily.includes('Bold') ? 'bold' : 'normal',
                fontWeight: selectedStyle.bold ? 'bold' : 'normal',
                textShadow: customSettings.outline ? 
                  `${customSettings.outlineWidth * 0.5}px ${customSettings.outlineWidth * 0.5}px 0px ${selectedStyle.outlineColor || '#000000'}` : 
                  'none',
                textAlign: 'center',
                lineHeight: 1.2,
                wordBreak: 'break-all'
              }}
            >
              示例字幕文本
            </span>
          </div>
        </Col>
      </Row>

      <Divider style={{ margin: '12px 0' }} />

      {/* 自定义调节选项 */}
      <Row gutter={[12, 8]}>
        <Col span={8}>
          <Text style={{ fontSize: 12 }}>字体大小</Text>
          <Slider
            min={10}
            max={32}
            value={customSettings.fontSize}
            onChange={(value) => updateSettings({ fontSize: value })}
            tooltip={{ formatter: (value) => `${value}px` }}
          />
        </Col>
        <Col span={8}>
          <Text style={{ fontSize: 12 }}>位置</Text>
          <Select 
            value={customSettings.position}
            onChange={(value) => updateSettings({ position: value })}
            style={{ width: '100%' }}
          >
            <Option value="top-center">顶部居中</Option>
            <Option value="center-center">中部居中</Option>
            <Option value="bottom-center">底部居中</Option>
          </Select>
        </Col>
        <Col span={8}>
          <Text style={{ fontSize: 12 }}>垂直边距</Text>
          <Slider
            min={10}
            max={100}
            value={customSettings.marginVertical}
            onChange={(value) => updateSettings({ marginVertical: value })}
            tooltip={{ formatter: (value) => `${value}px` }}
          />
        </Col>
      </Row>

      <Row gutter={[12, 8]} style={{ marginTop: 8 }}>
        <Col span={12}>
          <Text style={{ fontSize: 12 }}>描边</Text>
          <div style={{ marginTop: 4 }}>
            <Switch
                checked={customSettings.outline}
              onChange={(checked) => updateSettings({ outline: checked })}
            />
            {customSettings.outline && (
              <Slider
                min={1}
                max={5}
                value={customSettings.outlineWidth}
                onChange={(value) => updateSettings({ outlineWidth: value })}
                    style={{ marginTop: 4 }}
                tooltip={{ formatter: (value) => `${value}px` }}
              />
            )}
          </div>
        </Col>
        <Col span={12}>
          <Text style={{ fontSize: 12 }}>颜色</Text>
          <div style={{ marginTop: 4 }}>
            <input
              type="color"
              value={customSettings.color}
              onChange={(e) => updateSettings({ color: e.target.value })}
              style={{ 
                width: '100%', 
                height: 24, 
                border: '1px solid #d9d9d9',
                borderRadius: 4,
                cursor: 'pointer'
              }}
            />
          </div>
        </Col>
      </Row>

      {/* 样式描述 - 动态反映当前实际设置 */}
      <div style={{ marginTop: 12, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
        <Text style={{ fontSize: 11, color: '#666' }}>
          {`${customSettings.fontSize}px字体，${customSettings.color}颜色，${
            customSettings.position === 'top-center' ? '顶部' : 
            customSettings.position === 'center-center' ? '中部' : '底部'
          }居中${customSettings.outline ? '，描边效果' : ''}`}
        </Text>
      </div>
    </Card>
  )
})

export default CompactSubtitleSelector