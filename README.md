# 🎬 英语配音乐园

一个专为儿童设计的英语配音学习 App，通过给动画片配音的方式学习英语发音。

## ✨ 功能特性

### 前端 (React Native + Expo)
- 🏠 **首页** - 动画片列表展示，活泼可爱的 UI 设计
- 📺 **多级导航** - 动画片 → 季数 → 集数 → 配音片段
- 🎬 **视频播放** - 播放配音片段视频
- 🎤 **录音功能** - 录制用户配音
- 📊 **评分展示** - 显示详细的发音评分和反馈
- 👤 **个人中心** - 学习统计和成就系统

### 后端 (FastAPI + Vosk)
- 🎯 **语音识别** - 使用 Vosk 进行离线语音识别
- 📝 **音素对齐** - 音素级别的发音对比
- 💯 **智能评分** - 基于相似度和置信度的评分算法
- 💬 **个性反馈** - 根据得分给出鼓励性反馈

## 🚀 快速开始

### 前端启动

```bash
cd peiyin2

# 安装依赖
npm install

# 启动开发服务器
npm start
```

然后用 Expo Go App 扫码或在模拟器中运行。

### 后端启动

```bash
cd peiyin2/server

# 创建虚拟环境（可选）
python -m venv venv
source venv/bin/activate  # macOS/Linux
# 或 venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 下载 Vosk 模型（可选，不下载会使用模拟评分）
# wget https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
# unzip vosk-model-small-en-us-0.15.zip
# mv vosk-model-small-en-us-0.15 model

# 启动服务
python main.py
```

服务将在 http://localhost:8000 启动。

## 📱 应用截图

### 首页
- 展示所有可用的动画片
- 卡片式布局，带有缩略图和可爱装饰

### 配音页面
- 视频播放区域
- 原文和翻译对照
- 录音控制按钮
- 评分结果展示

## 🗂️ 项目结构

```
peiyin2/
├── app/                    # 页面路由
│   ├── (tabs)/            # Tab 导航页面
│   │   ├── index.tsx      # 首页
│   │   └── explore.tsx    # 个人中心
│   ├── cartoon/           
│   │   └── [id].tsx       # 动画片详情（季数列表）
│   ├── season/            
│   │   └── [id].tsx       # 季详情（集数列表）
│   ├── episode/           
│   │   └── [id].tsx       # 集详情（配音片段列表）
│   └── dubbing/           
│       └── [id].tsx       # 配音页面
├── components/            # 组件
├── config/               # 配置文件
│   └── api.ts            # API 配置
├── constants/            # 常量
│   └── theme.ts          # 主题颜色
├── data/                 # 数据
│   └── mock-data.ts      # 模拟数据
├── types/                # 类型定义
│   └── index.ts          # TypeScript 类型
├── hooks/                # 自定义 Hooks
└── server/               # 后端服务
    ├── main.py           # FastAPI 主程序
    ├── scoring.py        # Vosk 评分模块
    ├── requirements.txt  # Python 依赖
    └── README.md         # 后端文档
```

## 🎨 设计特色

- **活泼配色** - 使用明亮的橙色、紫色等适合儿童的颜色
- **圆角卡片** - 采用圆润的视觉风格
- **表情装饰** - 使用 Emoji 增加趣味性
- **渐变动效** - 平滑的页面切换动画

## 🔧 技术栈

### 前端
- React Native 0.81
- Expo 54
- Expo Router 6 (文件系统路由)
- Expo AV (视频播放 & 录音)
- TypeScript

### 后端
- FastAPI
- Vosk (离线语音识别)
- pydub (音频处理)
- Python 3.9+

## 📝 API 接口

### POST /api/score

评分接口，接收音频文件并返回评分结果。

**请求：**
- `audio`: 音频文件 (multipart/form-data)
- `text`: 原文文本
- `clip_id`: 配音片段 ID

**响应：**
```json
{
  "overallScore": 85,
  "wordScores": [
    {"word": "hello", "score": 90, "phonemes": [...]}
  ],
  "feedback": "很不错！继续保持！"
}
```

## 🎯 后续计划

- [ ] 添加用户登录注册
- [ ] 配音历史记录
- [ ] 排行榜功能
- [ ] 更多动画片内容
- [ ] 语音合成对比功能
- [ ] 离线缓存支持

## 📄 许可证

MIT

---

Made with ❤️ for kids learning English
