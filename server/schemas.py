"""
Pydantic 数据模式定义
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


# ===== 动画片 =====
class CartoonBase(BaseModel):
    name: str
    name_cn: str
    thumbnail: Optional[str] = None
    description: Optional[str] = None
    is_active: bool = True


class CartoonCreate(CartoonBase):
    id: str


class CartoonUpdate(BaseModel):
    name: Optional[str] = None
    name_cn: Optional[str] = None
    thumbnail: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class CartoonResponse(CartoonBase):
    id: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class CartoonListResponse(BaseModel):
    id: str
    name: str
    name_cn: str
    thumbnail: Optional[str]
    is_active: bool
    season_count: int = 0
    
    class Config:
        from_attributes = True


# ===== 季 =====
class SeasonBase(BaseModel):
    number: int
    is_active: bool = True


class SeasonCreate(SeasonBase):
    id: str
    cartoon_id: str


class SeasonUpdate(BaseModel):
    number: Optional[int] = None
    is_active: Optional[bool] = None


class SeasonResponse(SeasonBase):
    id: str
    cartoon_id: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class SeasonListResponse(BaseModel):
    id: str
    cartoon_id: str
    number: int
    is_active: bool
    episode_count: int = 0
    
    class Config:
        from_attributes = True


# ===== 集 =====
class EpisodeBase(BaseModel):
    number: int
    title: Optional[str] = None
    title_cn: Optional[str] = None
    thumbnail: Optional[str] = None
    is_active: bool = True


class EpisodeCreate(EpisodeBase):
    id: str
    season_id: str


class EpisodeUpdate(BaseModel):
    number: Optional[int] = None
    title: Optional[str] = None
    title_cn: Optional[str] = None
    thumbnail: Optional[str] = None
    is_active: Optional[bool] = None


class EpisodeResponse(EpisodeBase):
    id: str
    season_id: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class EpisodeListResponse(BaseModel):
    id: str
    season_id: str
    number: int
    title: Optional[str]
    title_cn: Optional[str]
    thumbnail: Optional[str]
    is_active: bool
    clip_count: int = 0
    
    class Config:
        from_attributes = True


# ===== 配音片段 =====
class DubbingClipBase(BaseModel):
    order: int
    video_url: Optional[str] = None
    original_text: str
    translation_cn: Optional[str] = None
    start_time: float = 0
    end_time: float = 0
    character: Optional[str] = None
    is_active: bool = True


class DubbingClipCreate(DubbingClipBase):
    id: str
    episode_id: str


class DubbingClipUpdate(BaseModel):
    order: Optional[int] = None
    video_url: Optional[str] = None
    original_text: Optional[str] = None
    translation_cn: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    character: Optional[str] = None
    is_active: Optional[bool] = None


class DubbingClipResponse(DubbingClipBase):
    id: str
    episode_id: str
    created_at: datetime
    
    class Config:
        from_attributes = True


# ===== 配音记录 =====
class DubbingRecordResponse(BaseModel):
    id: int
    clip_id: str
    user_id: Optional[str]
    score: Optional[int]
    feedback: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


# ===== 统计 =====
class StatsResponse(BaseModel):
    total_cartoons: int
    total_seasons: int
    total_episodes: int
    total_clips: int
    total_records: int
    recent_records: List[DubbingRecordResponse]


# ===== 用户学习统计 =====
class UserLearningStatsResponse(BaseModel):
    """用户学习统计"""
    dubbing_count: int  # 配音次数
    average_score: int  # 平均分数
    learning_days: int  # 学习天数


# ===== App API 响应 =====
class AppCartoonResponse(BaseModel):
    id: str
    name: str
    nameCN: str
    thumbnail: Optional[str]
    description: Optional[str]
    
    class Config:
        from_attributes = True


class AppSeasonResponse(BaseModel):
    id: str
    number: int
    cartoonId: str
    
    class Config:
        from_attributes = True


class AppEpisodeResponse(BaseModel):
    id: str
    number: int
    title: Optional[str]
    titleCN: Optional[str]
    thumbnail: Optional[str]
    seasonId: str
    
    class Config:
        from_attributes = True


class AppDubbingClipResponse(BaseModel):
    id: str
    episodeId: str
    order: int
    videoUrl: Optional[str]
    originalText: str
    translationCN: Optional[str]
    startTime: float
    endTime: float
    character: Optional[str]
    
    class Config:
        from_attributes = True
