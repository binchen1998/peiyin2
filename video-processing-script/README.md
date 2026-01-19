# 视频配音片段处理工具

从动画视频中自动提取字幕，使用 AI 选择适合儿童配音的片段，并生成视频片段和 JSON 数据。

## 功能

1. **字幕提取**: 使用 faster-whisper-xxl 从视频中提取 SRT 字幕
2. **智能选择**: 使用 ChatGPT 选择适合儿童配音的字幕片段
3. **视频分割**: 使用 ffmpeg 按字幕时间截取视频片段
4. **自动翻译**: 自动将字幕翻译成中文
5. **JSON 生成**: 生成包含所有信息的 JSON 文件

## 依赖

### Python 依赖
```bash
pip install -r requirements.txt
```

### 外部工具
- **faster-whisper-xxl**: 用于语音识别和字幕提取
  - 默认路径: `D:\Faster-Whisper-XXL_r192.3.3_windows\Faster-Whisper-XXL\faster-whisper-xxl.exe`
  - 如路径不同，请修改 `process_video.py` 中的 `WHISPER_EXE` 变量

- **ffmpeg**: 用于视频处理
  - 需要安装并添加到系统 PATH
  - 下载地址: https://ffmpeg.org/download.html

## 使用方法

### 处理单个视频
```bash
python process_video.py video.mp4 --api-key YOUR_OPENAI_API_KEY
```

### 处理目录下所有视频
```bash
python process_video.py /path/to/videos --api-key YOUR_OPENAI_API_KEY
```

### 指定片段数量
```bash
python process_video.py video.mp4 --api-key YOUR_API_KEY --clips 15
```

### 使用环境变量设置 API Key
```bash
set OPENAI_API_KEY=your_api_key
python process_video.py video.mp4
```

## 输出结构

处理单个视频 `example.mp4` 后的目录结构：
```
example/
├── example.srt          # 提取的字幕文件
├── example.json         # 生成的 JSON 数据
├── clips/               # 视频片段
│   ├── clip_1.mp4
│   ├── clip_2.mp4
│   └── ...
└── thumbnails/          # 缩略图
    ├── main.jpg
    ├── thumb_1.jpg
    └── ...
```

## JSON 格式

```json
{
  "title": "Let It Go",
  "title_cn": "随它吧",
  "thumbnail": "thumbnails/main.jpg",
  "source_video": "Let It Go.mp4",
  "generated_at": "2026-01-19T10:30:00",
  "clips": [
    {
      "video_url": "clips/clip_1.mp4",
      "original_text": "Let it go, let it go!",
      "translation_cn": "随它吧，随它吧！",
      "thumbnail": "thumbnails/thumb_1.jpg",
      "duration": 4.21
    }
  ]
}
```

## 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `input` | 视频文件或目录路径 | 必填 |
| `--api-key` | OpenAI API Key | 从环境变量读取 |
| `--clips` | 选择的片段数量 | 10 |
| `--output` | 输出目录 | 视频同目录 |

## 注意事项

1. 确保有足够的磁盘空间存储生成的视频片段
2. 处理长视频可能需要较长时间
3. OpenAI API 调用会产生费用
4. 建议先用短视频测试流程
