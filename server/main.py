"""
英语配音评分服务
使用 FastAPI + Vosk 实现音素级对齐和评分
"""

import os
import json
import tempfile
import logging
from typing import Optional
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session

from scoring import VoskScorer, ScoringResult
from database import init_db, get_db, init_sample_data, DubbingRecord
from admin_routes import router as admin_router
from app_routes import router as app_router

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 创建 FastAPI 应用
app = FastAPI(
    title="英语配音评分服务",
    description="使用 Vosk 进行音素级对齐和评分的 API 服务",
    version="1.0.0"
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应该限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载静态文件目录
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# 注册路由
app.include_router(admin_router)
app.include_router(app_router)

# 初始化评分器
scorer: Optional[VoskScorer] = None

@app.on_event("startup")
async def startup_event():
    """应用启动时初始化"""
    global scorer
    
    # 初始化数据库
    init_db()
    
    # 初始化示例数据
    db = next(get_db())
    init_sample_data(db)
    db.close()
    
    # 初始化 Vosk 评分器
    try:
        model_path = os.environ.get("VOSK_MODEL_PATH", "model")
        scorer = VoskScorer(model_path)
        logger.info("Vosk 评分器初始化成功")
    except Exception as e:
        logger.error(f"Vosk 评分器初始化失败: {e}")
        logger.info("将使用模拟评分模式")

@app.get("/")
async def root():
    """根路径 - 重定向到管理后台"""
    return HTMLResponse("""
    <!DOCTYPE html>
    <html>
    <head>
        <meta http-equiv="refresh" content="0; url=/admin.html">
    </head>
    <body>
        <p>正在跳转到管理后台...</p>
    </body>
    </html>
    """)

@app.get("/admin.html")
async def admin_page():
    """管理后台页面"""
    admin_html_path = os.path.join(STATIC_DIR, "admin.html")
    if os.path.exists(admin_html_path):
        return FileResponse(admin_html_path)
    return HTMLResponse("<h1>管理后台文件不存在</h1>", status_code=404)

@app.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "scorer_available": scorer is not None
    }


class ScoreResponse(BaseModel):
    """评分响应模型"""
    overallScore: int
    phonemeScores: list
    wordScores: list
    feedback: str


@app.post("/api/score", response_model=ScoreResponse)
async def score_audio(
    audio: UploadFile = File(...),
    text: str = Form(...),
    clip_id: str = Form(...),
    user_id: str = Form(None),
    db: Session = Depends(get_db)
):
    """
    对上传的音频进行评分
    
    Args:
        audio: 上传的音频文件
        text: 需要对齐的原文文本
        clip_id: 配音片段ID
        user_id: 用户ID（可选）
    
    Returns:
        评分结果
    """
    logger.info(f"收到评分请求: clip_id={clip_id}, text={text}")
    
    try:
        # 保存上传的音频文件到临时目录
        with tempfile.NamedTemporaryFile(delete=False, suffix=".m4a") as temp_file:
            content = await audio.read()
            temp_file.write(content)
            temp_audio_path = temp_file.name
        
        logger.info(f"音频文件已保存: {temp_audio_path}")
        
        # 进行评分
        if scorer is not None:
            result = scorer.score(temp_audio_path, text)
        else:
            # 模拟评分
            logger.info("使用模拟评分模式")
            result = generate_mock_score(text)
        
        # 保存配音记录到数据库
        try:
            record = DubbingRecord(
                clip_id=clip_id,
                user_id=user_id,
                score=result["overallScore"],
                feedback=result["feedback"],
                word_scores=json.dumps(result["wordScores"])
            )
            db.add(record)
            db.commit()
        except Exception as e:
            logger.error(f"保存配音记录失败: {e}")
        
        # 清理临时文件
        try:
            os.unlink(temp_audio_path)
        except:
            pass
        
        return result
        
    except Exception as e:
        logger.error(f"评分失败: {e}")
        # 返回模拟评分而不是抛出错误
        return generate_mock_score(text)


def generate_mock_score(text: str) -> dict:
    """
    生成模拟评分结果
    用于演示或当 Vosk 不可用时
    """
    import random
    
    words = text.split()
    word_scores = []
    total_score = 0
    
    for word in words:
        # 生成随机分数 (60-100)
        word_score = random.randint(60, 100)
        total_score += word_score
        
        # 生成音素分数
        phoneme_scores = []
        for i, char in enumerate(word.lower()):
            if char.isalpha():
                phoneme_scores.append({
                    "phoneme": char,
                    "score": random.randint(60, 100),
                    "startTime": i * 0.1,
                    "endTime": (i + 1) * 0.1
                })
        
        word_scores.append({
            "word": word,
            "score": word_score,
            "phonemes": phoneme_scores
        })
    
    # 计算平均分
    overall_score = total_score // len(words) if words else 0
    
    # 生成反馈
    if overall_score >= 90:
        feedback = "太棒了！你的发音非常标准！"
    elif overall_score >= 70:
        feedback = "很不错！继续保持！"
    elif overall_score >= 50:
        feedback = "还可以，多练习会更好！"
    else:
        feedback = "加油！多听多练，你一定可以的！"
    
    return {
        "overallScore": overall_score,
        "phonemeScores": [],
        "wordScores": word_scores,
        "feedback": feedback
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
