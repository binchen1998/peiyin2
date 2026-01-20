"""
App 前端 API 路由
提供给 React Native App 使用的接口
"""

import httpx
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from urllib.parse import urljoin

from database import get_db, Cartoon, Season, DubbingRecord, RecommendedClip, get_recommended_clips
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