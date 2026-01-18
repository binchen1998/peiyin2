"""
App 前端 API 路由
提供给 React Native App 使用的接口
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db, Cartoon, Season, Episode, DubbingClip
from schemas import (
    AppCartoonResponse, AppSeasonResponse, 
    AppEpisodeResponse, AppDubbingClipResponse
)

router = APIRouter(prefix="/api/app", tags=["App接口"])


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
            cartoonId=s.cartoon_id
        )
        for s in seasons
    ]


@router.get("/seasons/{season_id}/episodes", response_model=List[AppEpisodeResponse])
def get_episodes(season_id: str, db: Session = Depends(get_db)):
    """获取集列表"""
    episodes = db.query(Episode).filter(
        Episode.season_id == season_id,
        Episode.is_active == True
    ).order_by(Episode.number).all()
    
    return [
        AppEpisodeResponse(
            id=e.id,
            number=e.number,
            title=e.title,
            titleCN=e.title_cn,
            thumbnail=e.thumbnail,
            seasonId=e.season_id
        )
        for e in episodes
    ]


@router.get("/episodes/{episode_id}/clips", response_model=List[AppDubbingClipResponse])
def get_clips(episode_id: str, db: Session = Depends(get_db)):
    """获取配音片段列表"""
    clips = db.query(DubbingClip).filter(
        DubbingClip.episode_id == episode_id,
        DubbingClip.is_active == True
    ).order_by(DubbingClip.order).all()
    
    return [
        AppDubbingClipResponse(
            id=c.id,
            episodeId=c.episode_id,
            order=c.order,
            videoUrl=c.video_url,
            originalText=c.original_text,
            translationCN=c.translation_cn,
            startTime=c.start_time,
            endTime=c.end_time,
            character=c.character
        )
        for c in clips
    ]


@router.get("/clips/{clip_id}", response_model=AppDubbingClipResponse)
def get_clip(clip_id: str, db: Session = Depends(get_db)):
    """获取配音片段详情"""
    clip = db.query(DubbingClip).filter(
        DubbingClip.id == clip_id,
        DubbingClip.is_active == True
    ).first()
    
    if not clip:
        raise HTTPException(status_code=404, detail="配音片段不存在")
    
    return AppDubbingClipResponse(
        id=clip.id,
        episodeId=clip.episode_id,
        order=clip.order,
        videoUrl=clip.video_url,
        originalText=clip.original_text,
        translationCN=clip.translation_cn,
        startTime=clip.start_time,
        endTime=clip.end_time,
        character=clip.character
    )
