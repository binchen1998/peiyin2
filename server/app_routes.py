"""
App 前端 API 路由
提供给 React Native App 使用的接口
"""

import os
import uuid
import httpx
import mimetypes
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form, Request
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from urllib.parse import urljoin

from database import (
    get_db, Cartoon, Season, DubbingRecord, RecommendedClip, get_recommended_clips,
    VocalRemovalTask, get_vocal_removal_task, create_vocal_removal_task,
    delete_vocal_removal_task, cleanup_failed_vocal_removal_tasks,
    UserDubbing, create_user_dubbing, get_user_dubbing_by_id, update_user_dubbing,
    get_user_dubbings_by_user, count_user_dubbings_by_user,
    get_public_user_dubbings, count_public_user_dubbings, delete_user_dubbing
)
from schemas import (
    AppCartoonResponse, AppSeasonResponse, 
    AppEpisodeResponse, AppDubbingClipResponse,
    UserLearningStatsResponse, AppRecommendedClipResponse,
    PaginatedResponse
)
import math

router = APIRouter(prefix="/api/app", tags=["App接口"])


async def fetch_json(url: str) -> dict:
    """从 URL 获取 JSON 数据"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"无法获取远程数据: {str(e)}")


def get_base_url(all_json_url: str) -> str:
    """从 all.json URL 获取基础 URL"""
    # 例如: https://example.com/peppa/s1/all.json -> https://example.com/peppa/s1/
    if all_json_url.endswith('/all.json'):
        return all_json_url[:-8]  # 移除 'all.json'
    return all_json_url.rsplit('/', 1)[0] + '/'


@router.get("/cartoons")
def get_cartoons(
    featured_only: bool = False, 
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db)
):
    """
    获取动画片列表（仅启用的）
    featured_only: 是否只获取首页推荐的动画片
    page: 页码，从1开始
    page_size: 每页数量
    """
    query = db.query(Cartoon).filter(Cartoon.is_active == True)
    
    if featured_only:
        query = query.filter(Cartoon.is_featured == True)
    
    # 获取总数
    total = query.count()
    total_pages = math.ceil(total / page_size) if page_size > 0 else 0
    
    # 按 sort_order 排序，分页
    offset = (page - 1) * page_size
    cartoons = query.order_by(Cartoon.sort_order, Cartoon.id).offset(offset).limit(page_size).all()
    
    items = [
        AppCartoonResponse(
            id=c.id,
            name=c.name,
            nameCN=c.name_cn,
            thumbnail=c.thumbnail,
            description=c.description
        )
        for c in cartoons
    ]
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages
    }


@router.get("/cartoons/{cartoon_id}", response_model=AppCartoonResponse)
def get_cartoon(cartoon_id: str, db: Session = Depends(get_db)):
    """获取动画片详情"""
    cartoon = db.query(Cartoon).filter(
        Cartoon.id == cartoon_id,
        Cartoon.is_active == True
    ).first()
    
    if not cartoon:
        raise HTTPException(status_code=404, detail="动画片不存在")
    
    return AppCartoonResponse(
        id=cartoon.id,
        name=cartoon.name,
        nameCN=cartoon.name_cn,
        thumbnail=cartoon.thumbnail,
        description=cartoon.description
    )


@router.get("/cartoons/{cartoon_id}/seasons")
def get_seasons(
    cartoon_id: str, 
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db)
):
    """
    获取季列表
    page: 页码，从1开始
    page_size: 每页数量
    """
    query = db.query(Season).filter(
        Season.cartoon_id == cartoon_id,
        Season.is_active == True
    )
    
    # 获取总数
    total = query.count()
    total_pages = math.ceil(total / page_size) if page_size > 0 else 0
    
    # 分页
    offset = (page - 1) * page_size
    seasons = query.order_by(Season.number).offset(offset).limit(page_size).all()
    
    items = [
        AppSeasonResponse(
            id=s.id,
            number=s.number,
            cartoonId=s.cartoon_id,
            allJsonUrl=s.all_json_url
        )
        for s in seasons
    ]
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages
    }


@router.get("/seasons/{season_id}/episodes")
async def get_episodes(
    season_id: str, 
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db)
):
    """
    获取集列表
    从季的 all_json_url 动态获取
    page: 页码，从1开始
    page_size: 每页数量
    """
    season = db.query(Season).filter(
        Season.id == season_id,
        Season.is_active == True
    ).first()
    
    if not season:
        raise HTTPException(status_code=404, detail="季不存在")
    
    if not season.all_json_url:
        raise HTTPException(status_code=404, detail="该季未配置 all.json URL")
    
    # 获取 all.json
    all_data = await fetch_json(season.all_json_url)
    
    # all.json 格式: [{"id": 0, "name": "CE001 Muddy Puddles"}, ...]
    total = len(all_data)
    total_pages = math.ceil(total / page_size) if page_size > 0 else 0
    
    # 分页
    offset = (page - 1) * page_size
    paged_data = all_data[offset:offset + page_size]
    
    items = [
        AppEpisodeResponse(
            id=item["id"],
            name=item["name"],
            seasonId=season_id,
            title=item["name"],  # 默认使用 name 作为标题
            titleCN=None,
            thumbnail=None
        )
        for item in paged_data
    ]
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages
    }


@router.get("/seasons/{season_id}/episodes/{episode_name}", response_model=AppEpisodeResponse)
async def get_episode_detail(season_id: str, episode_name: str, db: Session = Depends(get_db)):
    """
    获取单集详情
    从单集的 JSON 文件动态获取
    """
    season = db.query(Season).filter(
        Season.id == season_id,
        Season.is_active == True
    ).first()
    
    if not season:
        raise HTTPException(status_code=404, detail="季不存在")
    
    if not season.all_json_url:
        raise HTTPException(status_code=404, detail="该季未配置 all.json URL")
    
    # 构建单集 JSON 的 URL
    base_url = get_base_url(season.all_json_url)
    # 先获取 all.json 找到对应的 id
    all_data = await fetch_json(season.all_json_url)
    
    episode_id = None
    for item in all_data:
        if item["name"] == episode_name:
            episode_id = item["id"]
            break
    
    if episode_id is None:
        raise HTTPException(status_code=404, detail="集不存在")
    
    # 获取单集 JSON
    # 假设单集 JSON 路径为: base_url/episode_name/episode_name.json
    episode_json_url = f"{base_url}{episode_name}/{episode_name}.json"
    
    try:
        episode_data = await fetch_json(episode_json_url)
        return AppEpisodeResponse(
            id=episode_id,
            name=episode_name,
            seasonId=season_id,
            title=episode_data.get("title", episode_name),
            titleCN=episode_data.get("title_cn"),
            thumbnail=episode_data.get("thumbnail")
        )
    except:
        # 如果获取失败，返回基本信息
        return AppEpisodeResponse(
            id=episode_id,
            name=episode_name,
            seasonId=season_id,
            title=episode_name,
            titleCN=None,
            thumbnail=None
        )


@router.get("/seasons/{season_id}/episodes/{episode_name}/clips")
async def get_clips(
    season_id: str, 
    episode_name: str, 
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db)
):
    """
    获取配音片段列表
    从单集的 JSON 文件动态获取
    page: 页码，从1开始
    page_size: 每页数量
    """
    season = db.query(Season).filter(
        Season.id == season_id,
        Season.is_active == True
    ).first()
    
    if not season:
        raise HTTPException(status_code=404, detail="季不存在")
    
    if not season.all_json_url:
        raise HTTPException(status_code=404, detail="该季未配置 all.json URL")
    
    # 构建单集 JSON 的 URL
    base_url = get_base_url(season.all_json_url)
    episode_json_url = f"{base_url}{episode_name}/{episode_name}.json"
    
    episode_data = await fetch_json(episode_json_url)
    
    all_clips = episode_data.get("clips", [])
    total = len(all_clips)
    total_pages = math.ceil(total / page_size) if page_size > 0 else 0
    
    # 分页
    offset = (page - 1) * page_size
    paged_clips = all_clips[offset:offset + page_size]
    
    items = []
    for clip in paged_clips:
        # 构建完整的 clip 路径
        clip_path = f"{episode_name}/{clip.get('video_url', '')}"
        
        # 构建完整的视频 URL
        video_url = f"{base_url}{clip_path}"
        
        # 构建缩略图 URL
        thumbnail = clip.get("thumbnail")
        if thumbnail:
            thumbnail = f"{base_url}{episode_name}/{thumbnail}"
        
        items.append(AppDubbingClipResponse(
            clipPath=clip_path,
            videoUrl=video_url,
            originalText=clip.get("original_text", ""),
            translationCN=clip.get("translation_cn"),
            thumbnail=thumbnail,
            duration=clip.get("duration", 0)
        ))
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages
    }


@router.get("/user/{user_id}/stats", response_model=UserLearningStatsResponse)
def get_user_stats(user_id: str, db: Session = Depends(get_db)):
    """获取用户学习统计"""
    # 配音次数
    dubbing_count = db.query(DubbingRecord).filter(
        DubbingRecord.user_id == user_id
    ).count()
    
    # 平均分数
    avg_result = db.query(func.avg(DubbingRecord.score)).filter(
        DubbingRecord.user_id == user_id,
        DubbingRecord.score.isnot(None)
    ).scalar()
    average_score = int(avg_result) if avg_result else 0
    
    # 学习天数（不同日期数）
    learning_days = db.query(
        func.count(distinct(func.date(DubbingRecord.created_at)))
    ).filter(
        DubbingRecord.user_id == user_id
    ).scalar() or 0
    
    return UserLearningStatsResponse(
        dubbing_count=dubbing_count,
        average_score=average_score,
        learning_days=learning_days
    )


@router.get("/user/{user_id}/records")
def get_user_records(
    user_id: str, 
    clip_path: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db)
):
    """
    获取用户配音记录
    page: 页码，从1开始
    page_size: 每页数量
    """
    query = db.query(DubbingRecord).filter(DubbingRecord.user_id == user_id)
    
    if clip_path:
        query = query.filter(DubbingRecord.clip_path == clip_path)
    
    # 获取总数
    total = query.count()
    total_pages = math.ceil(total / page_size) if page_size > 0 else 0
    
    # 分页
    offset = (page - 1) * page_size
    records = query.order_by(DubbingRecord.created_at.desc()).offset(offset).limit(page_size).all()
    
    import json
    items = [
        {
            "id": r.id,
            "clipPath": r.clip_path,
            "seasonId": r.season_id,
            "score": r.score,
            "feedback": r.feedback,
            "wordScores": json.loads(r.word_scores) if r.word_scores else [],
            "createdAt": r.created_at.isoformat() if r.created_at else None
        }
        for r in records
    ]
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages
    }


@router.get("/recommendations")
def get_recommendations(
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db)
):
    """
    获取首页推荐片段（所有用户看到相同内容）
    page: 页码，从1开始
    page_size: 每页数量
    """
    # 获取所有推荐片段
    all_clips = get_recommended_clips(db)
    total = len(all_clips)
    total_pages = math.ceil(total / page_size) if page_size > 0 else 0
    
    # 分页
    offset = (page - 1) * page_size
    paged_clips = all_clips[offset:offset + page_size]
    
    items = [
        AppRecommendedClipResponse(
            id=c.id,
            seasonId=c.season_id,
            episodeName=c.episode_name,
            clipPath=c.clip_path,
            videoUrl=c.video_url,
            thumbnail=c.thumbnail,
            originalText=c.original_text,
            translationCN=c.translation_cn,
            duration=c.duration
        )
        for c in paged_clips
    ]
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages
    }


# ===== 人声去除接口 =====


class VocalRemovalRequest(BaseModel):
    """人声去除请求"""
    video_url: str  # 视频URL，作为缓存key


class VocalRemovalResponse(BaseModel):
    """人声去除响应"""
    status: str  # pending, processing, completed, failed
    video_url: str  # 原始视频URL
    output_video_path: Optional[str] = None  # 处理后的视频路径
    error_message: Optional[str] = None  # 错误信息


@router.post("/vocal-removal", response_model=VocalRemovalResponse)
def request_vocal_removal(
    request: VocalRemovalRequest,
    db: Session = Depends(get_db)
):
    """
    请求去除视频人声
    
    接收一个视频 URL，后台 Worker 会：
    1. 下载视频
    2. 提取音频
    3. 使用 Demucs 分离出无人声版本
    4. 将无人声音频合成回视频
    5. 缓存结果（仅成功的结果会被缓存，失败的任务会被删除以便重试）
    
    客户端可以轮询 GET /api/app/vocal-removal 查询处理状态
    """
    video_url = request.video_url
    
    # 检查缓存（是否已经处理过）
    existing_task = get_vocal_removal_task(db, video_url)
    
    if existing_task:
        # 如果之前的任务失败了，删除旧任务，允许重试
        if existing_task.status == "failed":
            delete_vocal_removal_task(db, video_url)
            # 继续创建新任务
        else:
            # 如果任务正在处理中或已完成，返回现有状态
            return VocalRemovalResponse(
                status=existing_task.status,
                video_url=existing_task.video_url,
                output_video_path=existing_task.output_video_path,
                error_message=existing_task.error_message
            )
    
    # 创建新任务
    new_task = create_vocal_removal_task(db, video_url)
    
    return VocalRemovalResponse(
        status=new_task.status,
        video_url=new_task.video_url,
        output_video_path=None,
        error_message=None
    )


@router.get("/vocal-removal", response_model=VocalRemovalResponse)
def get_vocal_removal_status(
    video_url: str,
    db: Session = Depends(get_db)
):
    """
    查询人声去除任务状态（轮询接口）
    
    Args:
        video_url: 原始视频URL（作为缓存key）
    
    Returns:
        任务状态和结果
    """
    task = get_vocal_removal_task(db, video_url)
    
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    return VocalRemovalResponse(
        status=task.status,
        video_url=task.video_url,
        output_video_path=task.output_video_path,
        error_message=task.error_message
    )


# ===== 视频合成接口 =====

# 用户音频存储目录
USER_AUDIO_DIR = os.path.join(os.path.dirname(__file__), "user_audio")
USER_DUBBINGS_DIR = os.path.join(os.path.dirname(__file__), "user_dubbings")
os.makedirs(USER_AUDIO_DIR, exist_ok=True)
os.makedirs(USER_DUBBINGS_DIR, exist_ok=True)


class CompositeVideoResponse(BaseModel):
    """视频合成响应"""
    task_id: int
    status: str  # pending, processing, completed, failed
    composite_video_path: Optional[str] = None
    error_message: Optional[str] = None


class UserDubbingResponse(BaseModel):
    """用户配音响应"""
    id: int
    user_id: str
    clip_path: str
    season_id: Optional[str] = None
    original_video_url: str
    composite_video_path: Optional[str] = None
    status: str
    is_public: bool
    original_text: Optional[str] = None
    translation_cn: Optional[str] = None
    thumbnail: Optional[str] = None
    duration: float
    created_at: str


@router.post("/composite-video", response_model=CompositeVideoResponse)
async def create_composite_video(
    audio: UploadFile = File(...),
    video_url: str = Form(...),
    clip_path: str = Form(...),
    user_id: str = Form(...),
    season_id: str = Form(None),
    original_text: str = Form(None),
    translation_cn: str = Form(None),
    thumbnail: str = Form(None),
    duration: float = Form(0),
    db: Session = Depends(get_db)
):
    """
    提交视频合成请求
    
    接收用户录音和原始视频URL，后台 Worker 会：
    1. 获取或创建背景音（从原视频分离人声）
    2. 获取或创建无声视频
    3. 合并用户配音和背景音
    4. 将合成音频与无声视频合成
    5. 返回最终视频路径
    
    客户端可以轮询 GET /api/app/composite-video 查询处理状态
    """
    try:
        # 保存用户上传的音频文件
        audio_filename = f"{uuid.uuid4().hex}_{audio.filename or 'recording.m4a'}"
        audio_path = os.path.join(USER_AUDIO_DIR, audio_filename)
        
        content = await audio.read()
        with open(audio_path, 'wb') as f:
            f.write(content)
        
        # 创建配音任务记录
        dubbing = create_user_dubbing(
            db,
            user_id=user_id,
            clip_path=clip_path,
            season_id=season_id,
            original_video_url=video_url,
            user_audio_path=f"/user_audio/{audio_filename}",
            status="pending",
            original_text=original_text,
            translation_cn=translation_cn,
            thumbnail=thumbnail,
            duration=duration
        )
        
        return CompositeVideoResponse(
            task_id=dubbing.id,
            status=dubbing.status,
            composite_video_path=None,
            error_message=None
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建任务失败: {str(e)}")


@router.get("/composite-video", response_model=CompositeVideoResponse)
def get_composite_video_status(
    task_id: int,
    db: Session = Depends(get_db)
):
    """
    查询视频合成任务状态（轮询接口）
    
    Args:
        task_id: 任务ID
    
    Returns:
        任务状态和结果
    """
    dubbing = get_user_dubbing_by_id(db, task_id)
    
    if not dubbing:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    return CompositeVideoResponse(
        task_id=dubbing.id,
        status=dubbing.status,
        composite_video_path=dubbing.composite_video_path,
        error_message=dubbing.error_message
    )


# ===== 用户配音列表接口 =====

@router.get("/user/{user_id}/dubbings")
def get_user_dubbing_list(
    user_id: str,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db)
):
    """
    获取用户的配音列表
    
    Args:
        user_id: 用户ID
        page: 页码
        page_size: 每页数量
    
    Returns:
        用户配音列表（分页）
    """
    offset = (page - 1) * page_size
    total = count_user_dubbings_by_user(db, user_id)
    total_pages = math.ceil(total / page_size) if page_size > 0 else 0
    
    dubbings = get_user_dubbings_by_user(db, user_id, offset, page_size)
    
    items = [
        UserDubbingResponse(
            id=d.id,
            user_id=d.user_id,
            clip_path=d.clip_path,
            season_id=d.season_id,
            original_video_url=d.original_video_url,
            composite_video_path=d.composite_video_path,
            status=d.status,
            is_public=d.is_public,
            original_text=d.original_text,
            translation_cn=d.translation_cn,
            thumbnail=d.thumbnail,
            duration=d.duration or 0,
            created_at=d.created_at.isoformat() if d.created_at else ""
        )
        for d in dubbings
    ]
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages
    }


@router.get("/dubbings/public")
def get_public_dubbing_list(
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db)
):
    """
    获取公开分享的配音列表
    
    Args:
        page: 页码
        page_size: 每页数量
    
    Returns:
        公开配音列表（分页）
    """
    offset = (page - 1) * page_size
    total = count_public_user_dubbings(db)
    total_pages = math.ceil(total / page_size) if page_size > 0 else 0
    
    dubbings = get_public_user_dubbings(db, offset, page_size)
    
    items = [
        UserDubbingResponse(
            id=d.id,
            user_id=d.user_id,
            clip_path=d.clip_path,
            season_id=d.season_id,
            original_video_url=d.original_video_url,
            composite_video_path=d.composite_video_path,
            status=d.status,
            is_public=d.is_public,
            original_text=d.original_text,
            translation_cn=d.translation_cn,
            thumbnail=d.thumbnail,
            duration=d.duration or 0,
            created_at=d.created_at.isoformat() if d.created_at else ""
        )
        for d in dubbings
    ]
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages
    }


@router.put("/user/{user_id}/dubbings/{dubbing_id}/public")
def update_dubbing_public_status(
    user_id: str,
    dubbing_id: int,
    is_public: bool,
    db: Session = Depends(get_db)
):
    """
    更新配音的公开状态
    """
    dubbing = get_user_dubbing_by_id(db, dubbing_id)
    
    if not dubbing:
        raise HTTPException(status_code=404, detail="配音不存在")
    
    if dubbing.user_id != user_id:
        raise HTTPException(status_code=403, detail="无权操作此配音")
    
    updated = update_user_dubbing(db, dubbing_id, is_public=is_public)
    
    return {"status": "ok", "is_public": updated.is_public}


@router.delete("/user/{user_id}/dubbings/{dubbing_id}")
def delete_user_dubbing_record(
    user_id: str,
    dubbing_id: int,
    db: Session = Depends(get_db)
):
    """
    删除用户配音
    """
    success = delete_user_dubbing(db, dubbing_id, user_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="配音不存在或无权删除")
    
    return {"status": "ok"}


# ===== 视频流接口（支持 Range 请求）=====

@router.get("/video/{filename:path}")
async def stream_video(filename: str, request: Request):
    """
    视频流接口，支持 HTTP Range 请求
    iOS 视频播放器需要 Range 请求支持
    
    Args:
        filename: 视频文件名（在 user_dubbings 目录下）
        request: HTTP 请求对象（获取 Range 头）
    
    Returns:
        视频流响应
    """
    video_path = os.path.join(USER_DUBBINGS_DIR, filename)
    
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="视频文件不存在")
    
    file_size = os.path.getsize(video_path)
    
    # 获取 Content-Type
    content_type, _ = mimetypes.guess_type(video_path)
    if content_type is None:
        content_type = "video/mp4"
    
    # 检查是否有 Range 请求头
    range_header = request.headers.get("range")
    
    if range_header:
        # 解析 Range 头: bytes=start-end
        try:
            range_value = range_header.replace("bytes=", "")
            if "-" in range_value:
                parts = range_value.split("-")
                start = int(parts[0]) if parts[0] else 0
                end = int(parts[1]) if parts[1] else file_size - 1
            else:
                start = int(range_value)
                end = file_size - 1
        except ValueError:
            start = 0
            end = file_size - 1
        
        # 确保范围有效
        start = max(0, min(start, file_size - 1))
        end = max(start, min(end, file_size - 1))
        
        content_length = end - start + 1
        
        # 创建生成器读取文件片段
        def iter_file():
            with open(video_path, "rb") as f:
                f.seek(start)
                remaining = content_length
                while remaining > 0:
                    chunk_size = min(8192, remaining)
                    data = f.read(chunk_size)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data
        
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
            "Content-Type": content_type,
        }
        
        return StreamingResponse(
            iter_file(),
            status_code=206,  # Partial Content
            headers=headers,
            media_type=content_type
        )
    else:
        # 没有 Range 请求，返回整个文件
        def iter_file():
            with open(video_path, "rb") as f:
                while chunk := f.read(8192):
                    yield chunk
        
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Type": content_type,
        }
        
        return StreamingResponse(
            iter_file(),
            headers=headers,
            media_type=content_type
        )