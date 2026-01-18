# 英语配音评分服务

基于 FastAPI 和 Vosk 的英语配音评分后端服务。

## 功能特性

- 🎤 接收音频上传
- 📝 使用 Vosk 进行语音识别
- 📊 音素级对齐评分
- 💯 返回详细的评分结果

## 快速开始

### 1. 安装依赖

```bash
cd server
pip install -r requirements.txt
```

### 2. 下载 Vosk 模型

从 [Vosk 模型列表](https://alphacephei.com/vosk/models) 下载英语模型。

推荐使用小型模型进行测试：
- `vosk-model-small-en-us-0.15` (40MB)

下载后解压到 `server/model` 目录：

```bash
wget https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
unzip vosk-model-small-en-us-0.15.zip
mv vosk-model-small-en-us-0.15 model
```

### 3. 启动服务

```bash
python main.py
```

或使用 uvicorn：

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

服务将在 http://localhost:8000 启动。

## API 文档

启动服务后，访问以下地址查看 API 文档：

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## API 端点

### GET /

根路径，返回服务状态。

### GET /health

健康检查端点。

### POST /api/score

评分接口。

**请求参数（multipart/form-data）：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| audio | file | 是 | 音频文件 |
| text | string | 是 | 需要对齐的原文文本 |
| clip_id | string | 是 | 配音片段ID |

**响应示例：**

```json
{
  "overallScore": 85,
  "phonemeScores": [],
  "wordScores": [
    {
      "word": "hello",
      "score": 90,
      "phonemes": [
        {"phoneme": "h", "score": 88, "startTime": 0, "endTime": 0.1},
        {"phoneme": "e", "score": 92, "startTime": 0.1, "endTime": 0.2}
      ]
    }
  ],
  "feedback": "很不错！大部分单词发音正确，继续练习！"
}
```

## 配置

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| VOSK_MODEL_PATH | model | Vosk 模型路径 |

## 注意事项

1. **模拟模式**：如果 Vosk 模型未配置，服务会自动使用模拟评分模式返回随机分数。

2. **音频格式**：支持常见的音频格式（m4a, mp3, wav 等），服务会自动转换为 Vosk 所需的格式。

3. **生产部署**：
   - 配置适当的 CORS 策略
   - 使用 HTTPS
   - 配置日志和监控

## 技术栈

- FastAPI - 现代 Python Web 框架
- Vosk - 离线语音识别
- pydub - 音频处理
- uvicorn - ASGI 服务器

## 许可证

MIT
