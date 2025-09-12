#!/usr/bin/env python3
"""
手动下载 faster-whisper 模型的脚本
运行此脚本可预下载模型，避免运行时下载失败
"""

import os
from faster_whisper import WhisperModel

def download_model():
    """下载 faster-whisper base 模型到本地缓存"""
    try:
        print("开始下载 faster-whisper base 模型...")
        
        # 下载并缓存模型
        model = WhisperModel("base", device="cpu", local_files_only=False)
        
        print("✅ 模型下载成功！")
        print(f"模型已缓存到系统默认位置")
        
        # 测试模型是否可用
        print("正在测试模型...")
        segments, info = model.transcribe("silence.wav", language="zh")  # 这会创建一个测试
        print(f"✅ 模型测试成功！检测到语言: {info.language}")
        
        return True
        
    except Exception as e:
        print(f"❌ 模型下载失败: {e}")
        return False

if __name__ == "__main__":
    success = download_model()
    if success:
        print("\n🎉 可以正常使用 Whisper 字幕生成功能了！")
    else:
        print("\n💡 请检查网络连接或尝试其他解决方案")