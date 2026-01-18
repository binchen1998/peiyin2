"""
后台管理 API 路由
"""

import os
import uuid
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db, Cartoon, Season, Episode, DubbingClip, DubbingRecord
from schemas import (
    CartoonCreate, CartoonUpdate, CartoonResponse, CartoonListResponse,
    SeasonCreate, SeasonUpdate, SeasonResponse, SeasonListResponse,
    EpisodeCreate, EpisodeUpdate, EpisodeResponse, EpisodeListResponse,
    DubbingClipCreate, DubbingClipUpdate, DubbingClipResponse,
    DubbingRecordResponse, StatsResponse
)

router = APIRouter(prefix="/admin", tags=["后台管理"])

# 文件上传目录
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ===== 统计 =====
@router.get("/stats", response_model=StatsResponse)
def get_stats(db: Session = Depends(get_db)):
    """获取统计数据"""
    total_cartoons = db.query(Cartoon).count()
    total_seasons = db.query(Season).count()
    total_episodes = db.query(Episode).count()
    total_clips = db.query(DubbingClip).count()
    total_records = db.query(DubbingRecord).count()
    
    # 最近的配音记录
    recent_records = db.query(DubbingRecord).order_by(
        DubbingRecord.created_at.desc()
    ).limit(10).all()
    
    return StatsResponse(
        total_cartoons=total_cartoons,
        total_seasons=total_seasons,
        total_episodes=total_episodes,
        total_clips=total_clips,
        total_records=total_records,
        recent_records=recent_records
    )


# ===== 动画片管理 =====
@router.get("/cartoons", response_model=List[CartoonListResponse])
def list_cartoons(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """获取动画片列表"""
    cartoons = db.query(Cartoon).offset(skip).limit(limit).all()
    result = []
    for cartoon in cartoons:
        season_count = db.query(Season).filter(Season.cartoon_id == cartoon.id).count()
        result.append(CartoonListResponse(
            id=cartoon.id,
            name=cartoon.name,
            name_cn=cartoon.name_cn,
            thumbnail=cartoon.thumbnail,
            is_active=cartoon.is_active,
            season_count=season_count
        ))
    return result


@router.get("/cartoons/{cartoon_id}", response_model=CartoonResponse)
def get_cartoon(cartoon_id: str, db: Session = Depends(get_db)):
    """获取动画片详情"""
    cartoon = db.query(Cartoon).filter(Cartoon.id == cartoon_id).first()
    if not cartoon:
        raise HTTPException(status_code=404, detail="动画片不存在")
    return cartoon


@router.post("/cartoons", response_model=CartoonResponse)
def create_cartoon(cartoon: CartoonCreate, db: Session = Depends(get_db)):
    """创建动画片"""
    # 检查ID是否已存在
    existing = db.query(Cartoon).filter(Cartoon.id == cartoon.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="动画片ID已存在")
    
    db_cartoon = Cartoon(**cartoon.model_dump())
    db.add(db_cartoon)
    db.commit()
    db.refresh(db_cartoon)
    return db_cartoon


@router.put("/cartoons/{cartoon_id}", response_model=CartoonResponse)
def update_cartoon(
    cartoon_id: str,
    cartoon: CartoonUpdate,
    db: Session = Depends(get_db)
):
    """更新动画片"""
    db_cartoon = db.query(Cartoon).filter(Cartoon.id == cartoon_id).first()
    if not db_cartoon:
        raise HTTPException(status_code=404, detail="动画片不存在")
    
    update_data = cartoon.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_cartoon, key, value)
    
    db.commit()
    db.refresh(db_cartoon)
    return db_cartoon


@router.delete("/cartoons/{cartoon_id}")
def delete_cartoon(cartoon_id: str, db: Session = Depends(get_db)):
    """删除动画片"""
    db_cartoon = db.query(Cartoon).filter(Cartoon.id == cartoon_id).first()
    if not db_cartoon:
        raise HTTPException(status_code=404, detail="动画片不存在")
    
    db.delete(db_cartoon)
    db.commit()
    return {"message": "删除成功"}


# ===== 季管理 =====
@router.get("/seasons", response_model=List[SeasonListResponse])
def list_seasons(
    cartoon_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """获取季列表"""
    query = db.query(Season)
    if cartoon_id:
        query = query.filter(Season.cartoon_id == cartoon_id)
    
    seasons = query.order_by(Season.number).all()
    result = []
    for season in seasons:
        episode_count = db.query(Episode).filter(Episode.season_id == season.id).count()
        result.append(SeasonListResponse(
            id=season.id,
            cartoon_id=season.cartoon_id,
            number=season.number,
            is_active=season.is_active,
            episode_count=episode_count
        ))
    return result


@router.post("/seasons", response_model=SeasonResponse)
def create_season(season: SeasonCreate, db: Session = Depends(get_db)):
    """创建季"""
    # 检查动画片是否存在
    cartoon = db.query(Cartoon).filter(Cartoon.id == season.cartoon_id).first()
    if not cartoon:
        raise HTTPException(status_code=404, detail="动画片不存在")
    
    # 检查ID是否已存在
    existing = db.query(Season).filter(Season.id == season.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="季ID已存在")
    
    db_season = Season(**season.model_dump())
    db.add(db_season)
    db.commit()
    db.refresh(db_season)
    return db_season


@router.put("/seasons/{season_id}", response_model=SeasonResponse)
def update_season(
    season_id: str,
    season: SeasonUpdate,
    db: Session = Depends(get_db)
):
    """更新季"""
    db_season = db.query(Season).filter(Season.id == season_id).first()
    if not db_season:
        raise HTTPException(status_code=404, detail="季不存在")
    
    update_data = season.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_season, key, value)
    
    db.commit()
    db.refresh(db_season)
    return db_season


@router.delete("/seasons/{season_id}")
def delete_season(season_id: str, db: Session = Depends(get_db)):
    """删除季"""
    db_season = db.query(Season).filter(Season.id == season_id).first()
    if not db_season:
        raise HTTPException(status_code=404, detail="季不存在")
    
    db.delete(db_season)
    db.commit()
    return {"message": "删除成功"}


# ===== 集管理 =====
@router.get("/episodes", response_model=List[EpisodeListResponse])
def list_episodes(
    season_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """获取集列表"""
    query = db.query(Episode)
    if season_id:
        query = query.filter(Episode.season_id == season_id)
    
    episodes = query.order_by(Episode.number).all()
    result = []
    for episode in episodes:
        clip_count = db.query(DubbingClip).filter(DubbingClip.episode_id == episode.id).count()
        result.append(EpisodeListResponse(
            id=episode.id,
            season_id=episode.season_id,
            number=episode.number,
            title=episode.title,
            title_cn=episode.title_cn,
            thumbnail=episode.thumbnail,
            is_active=episode.is_active,
            clip_count=clip_count
        ))
    return result


@router.post("/episodes", response_model=EpisodeResponse)
def create_episode(episode: EpisodeCreate, db: Session = Depends(get_db)):
    """创建集"""
    # 检查季是否存在
    season = db.query(Season).filter(Season.id == episode.season_id).first()
    if not season:
        raise HTTPException(status_code=404, detail="季不存在")
    
    # 检查ID是否已存在
    existing = db.query(Episode).filter(Episode.id == episode.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="集ID已存在")
    
    db_episode = Episode(**episode.model_dump())
    db.add(db_episode)
    db.commit()
    db.refresh(db_episode)
    return db_episode


@router.put("/episodes/{episode_id}", response_model=EpisodeResponse)
def update_episode(
    episode_id: str,
    episode: EpisodeUpdate,
    db: Session = Depends(get_db)
):
    """更新集"""
    db_episode = db.query(Episode).filter(Episode.id == episode_id).first()
    if not db_episode:
        raise HTTPException(status_code=404, detail="集不存在")
    
    update_data = episode.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_episode, key, value)
    
    db.commit()
    db.refresh(db_episode)
    return db_episode


@router.delete("/episodes/{episode_id}")
def delete_episode(episode_id: str, db: Session = Depends(get_db)):
    """删除集"""
    db_episode = db.query(Episode).filter(Episode.id == episode_id).first()
    if not db_episode:
        raise HTTPException(status_code=404, detail="集不存在")
    
    db.delete(db_episode)
    db.commit()
    return {"message": "删除成功"}


# ===== 配音片段管理 =====
@router.get("/clips", response_model=List[DubbingClipResponse])
def list_clips(
    episode_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """获取配音片段列表"""
    query = db.query(DubbingClip)
    if episode_id:
        query = query.filter(DubbingClip.episode_id == episode_id)
    
    return query.order_by(DubbingClip.order).all()


@router.get("/clips/{clip_id}", response_model=DubbingClipResponse)
def get_clip(clip_id: str, db: Session = Depends(get_db)):
    """获取配音片段详情"""
    clip = db.query(DubbingClip).filter(DubbingClip.id == clip_id).first()
    if not clip:
        raise HTTPException(status_code=404, detail="配音片段不存在")
    return clip


@router.post("/clips", response_model=DubbingClipResponse)
def create_clip(clip: DubbingClipCreate, db: Session = Depends(get_db)):
    """创建配音片段"""
    # 检查集是否存在
    episode = db.query(Episode).filter(Episode.id == clip.episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail="集不存在")
    
    # 检查ID是否已存在
    existing = db.query(DubbingClip).filter(DubbingClip.id == clip.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="配音片段ID已存在")
    
    db_clip = DubbingClip(**clip.model_dump())
    db.add(db_clip)
    db.commit()
    db.refresh(db_clip)
    return db_clip


@router.put("/clips/{clip_id}", response_model=DubbingClipResponse)
def update_clip(
    clip_id: str,
    clip: DubbingClipUpdate,
    db: Session = Depends(get_db)
):
    """更新配音片段"""
    db_clip = db.query(DubbingClip).filter(DubbingClip.id == clip_id).first()
    if not db_clip:
        raise HTTPException(status_code=404, detail="配音片段不存在")
    
    update_data = clip.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_clip, key, value)
    
    db.commit()
    db.refresh(db_clip)
    return db_clip


@router.delete("/clips/{clip_id}")
def delete_clip(clip_id: str, db: Session = Depends(get_db)):
    """删除配音片段"""
    db_clip = db.query(DubbingClip).filter(DubbingClip.id == clip_id).first()
    if not db_clip:
        raise HTTPException(status_code=404, detail="配音片段不存在")
    
    db.delete(db_clip)
    db.commit()
    return {"message": "删除成功"}


# ===== 配音记录 =====
@router.get("/records", response_model=List[DubbingRecordResponse])
def list_records(
    clip_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """获取配音记录列表"""
    query = db.query(DubbingRecord)
    if clip_id:
        query = query.filter(DubbingRecord.clip_id == clip_id)
    
    return query.order_by(DubbingRecord.created_at.desc()).offset(skip).limit(limit).all()


@router.delete("/records/{record_id}")
def delete_record(record_id: int, db: Session = Depends(get_db)):
    """删除配音记录"""
    db_record = db.query(DubbingRecord).filter(DubbingRecord.id == record_id).first()
    if not db_record:
        raise HTTPException(status_code=404, detail="配音记录不存在")
    
    db.delete(db_record)
    db.commit()
    return {"message": "删除成功"}


# ===== 文件上传 =====
@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    type: str = Form("image")  # image 或 video
):
    """上传文件"""
    # 生成唯一文件名
    ext = file.filename.split(".")[-1] if file.filename else "bin"
    filename = f"{uuid.uuid4().hex}.{ext}"
    
    # 创建子目录
    subdir = "images" if type == "image" else "videos"
    upload_path = os.path.join(UPLOAD_DIR, subdir)
    os.makedirs(upload_path, exist_ok=True)
    
    # 保存文件
    file_path = os.path.join(upload_path, filename)
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    # 返回文件URL
    url = f"/uploads/{subdir}/{filename}"
    return {"url": url, "filename": filename}
