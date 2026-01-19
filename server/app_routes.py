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

from database import get_db, Cartoon, Season, DubbingRecord
from schemas import (
    AppCartoonResponse, AppSeasonResponse, 
    AppEpisodeResponse, AppDubbingClipResponse,
    UserLearningStatsResponse
)

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


@router.get("/cartoons", response_model=List[AppCartoonResponse])
def get_cartoons(db: Session = Depends(get_db)):
    """获取动画片列表（仅启用的）"""
    cartoons = db.query(Cartoon).filter(Cartoon.is_active == True).all()
    return [
        AppCartoonResponse(
            id=c.id,
            name=c.name,
            nameCN=c.name_cn,
            thumbnail=c.thumbnail,
            description=c.description
        )
        for c in cartoons
    ]


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


@router.get("/cartoons/{cartoon_id}/seasons", response_model=List[AppSeasonResponse])
def get_seasons(cartoon_id: str, db: Session = Depends(get_db)):
    """获取季列表"""
    seasons = db.query(Season).filter(
        Season.cartoon_id == cartoon_id,
        Season.is_active == True
    ).order_by(Season.number).all()
    
    return [
        AppSeasonResponse(
            id=s.id,
            number=s.number,
            cartoonId=s.cartoon_id,
            allJsonUrl=s.all_json_url
        )
        for s in seasons
    ]


@router.get("/seasons/{season_id}/episodes", response_model=List[AppEpisodeResponse])
async def get_episodes(season_id: str, db: Session = Depends(get_db)):
    """
    获取集列表
    从季的 all_json_url 动态获取
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
    episodes = []
    for item in all_data:
        episodes.append(AppEpisodeResponse(
            id=item["id"],
            name=item["name"],
            seasonId=season_id,
            title=item["name"],  # 默认使用 name 作为标题
            titleCN=None,
            thumbnail=None
        ))
    
    return episodes


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


@router.get("/seasons/{season_id}/episodes/{episode_name}/clips", response_model=List[AppDubbingClipResponse])
async def get_clips(season_id: str, episode_name: str, db: Session = Depends(get_db)):
    """
    获取配音片段列表
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
    episode_json_url = f"{base_url}{episode_name}/{episode_name}.json"
    
    episode_data = await fetch_json(episode_json_url)
    
    clips = []
    for i, clip in enumerate(episode_data.get("clips", [])):
        # 构建完整的 clip 路径
        clip_path = f"{episode_name}/{clip.get('video_url', '')}"
        
        # 构建完整的视频 URL
        video_url = f"{base_url}{clip_path}"
        
        # 构建缩略图 URL
        thumbnail = clip.get("thumbnail")
        if thumbnail:
            thumbnail = f"{base_url}{episode_name}/{thumbnail}"
        
        clips.append(AppDubbingClipResponse(
            clipPath=clip_path,
            videoUrl=video_url,
            originalText=clip.get("original_text", ""),
            translationCN=clip.get("translation_cn"),
            thumbnail=thumbnail,
            duration=clip.get("duration", 0)
        ))
    
    return clips


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
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """获取用户配音记录"""
    query = db.query(DubbingRecord).filter(DubbingRecord.user_id == user_id)
    
    if clip_path:
        query = query.filter(DubbingRecord.clip_path == clip_path)
    
    records = query.order_by(DubbingRecord.created_at.desc()).offset(skip).limit(limit).all()
    
    import json
    return [
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
