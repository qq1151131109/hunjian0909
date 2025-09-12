#!/usr/bin/env python3
"""
离线下载 Whisper 模型的脚本
适用于无法连接外网的环境
"""

import os
import requests
import zipfile
from pathlib import Path

def download_whisper_model_offline():
    """
    手动下载 Whisper 模型文件到本地
    """
    
    # 创建模型目录
    model_dir = Path.home() / ".cache" / "huggingface" / "hub" / "models--Systran--faster-whisper-base"
    model_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"模型将保存到: {model_dir}")
    
    # Whisper Base 模型的关键文件URLs (使用国内镜像)
    base_url = "https://hf-mirror.com/Systran/faster-whisper-base/resolve/main"
    files_to_download = [
        "config.json",
        "model.bin", 
        "tokenizer.json",
        "vocabulary.txt",
        "preprocessor_config.json",
        "added_tokens.json",
        "normalizer.json",
        "merges.txt"
    ]
    
    try:
        for filename in files_to_download:
            file_url = f"{base_url}/{filename}"
            file_path = model_dir / filename
            
            if file_path.exists():
                print(f"✓ {filename} 已存在，跳过下载")
                continue
                
            print(f"下载 {filename}...")
            
            response = requests.get(file_url, timeout=30)
            if response.status_code == 200:
                with open(file_path, 'wb') as f:
                    f.write(response.content)
                print(f"✓ {filename} 下载完成")
            else:
                print(f"✗ {filename} 下载失败: {response.status_code}")
                return False
        
        # 创建版本标识文件
        refs_dir = model_dir / "refs"
        refs_dir.mkdir(exist_ok=True)
        with open(refs_dir / "main", 'w') as f:
            f.write("main")
            
        print("\n🎉 模型下载完成！")
        return True
        
    except Exception as e:
        print(f"❌ 下载过程出错: {e}")
        return False

def download_from_alternative_sources():
    """
    从其他国内源下载预编译的模型
    """
    print("尝试从其他源下载...")
    
    # 可以添加其他下载源
    alternative_urls = [
        "https://model.baai.ac.cn/models/whisper-base",  # 示例：智源
        "https://cloud.tsinghua.edu.cn/models/whisper",   # 示例：清华云
    ]
    
    # 这里可以添加具体的下载逻辑
    print("请手动从以下渠道获取模型:")
    print("1. 百度网盘分享的 Whisper 模型")
    print("2. 阿里云盘分享的模型文件") 
    print("3. 通过有外网的机器下载后拷贝")

if __name__ == "__main__":
    print("开始下载 Whisper 模型...")
    
    success = download_whisper_model_offline()
    
    if not success:
        print("\n使用镜像源下载失败，尝试其他方案...")
        download_from_alternative_sources()
    
    print("\n运行完成！")