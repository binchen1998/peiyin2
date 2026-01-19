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
    all_json_url: Optional[str] = None  # all.json 的 URL
    is_active: bool = True


class SeasonCreate(SeasonBase):
    id: str
    cartoon_id: str


class SeasonUpdate(BaseModel):
    number: Optional[int] = None
    all_json_url: Optional[str] = None
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
    all_json_url: Optional[str]
    is_active: bool
    
    class Config:
        from_attributes = True


# ===== 集（从 JSON 动态获取，不存储在数据库）=====
class EpisodeFromJson(BaseModel):
    """从 all.json 获取的集信息"""
    id: int  # 在 all.json 中的序号
    name: str  # 目录名称


class EpisodeDetailFromJson(BaseModel):
    """从单集 JSON 获取的详细信息"""
    title: str
    title_cn: Optional[str] = None
    thumbnail: Optional[str] = None
    source_video: Optional[str] = None


# ===== 配音片段（从 JSON 动态获取，不存储在数据库）=====
class ClipFromJson(BaseModel):
    """从单集 JSON 获取的配音片段"""
    video_url: str
    original_text: str
    translation_cn: Optional[str] = None
    thumbnail: Optional[str] = None
    duration: float = 0


# ===== 配音记录 =====
class DubbingRecordResponse(BaseModel):
    id: int
    clip_path: Optional[str] = None  # clip 的完整路径
    user_id: Optional[str] = None
    score: Optional[int] = None
    feedback: Optional[str] = None
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
    allJsonUrl: Optional[str]
    
    class Config:
        from_attributes = True


class AppEpisodeResponse(BaseModel):
    """从 all.json 动态获取的集信息"""
    id: int  # 在 all.json 中的序号
    name: str  # 目录名称
    seasonId: str
    # 以下字段从单集 JSON 获取
    title: Optional[str] = None
    titleCN: Optional[str] = None
    thumbnail: Optional[str] = None


class AppDubbingClipResponse(BaseModel):
    """从单集 JSON 动态获取的配音片段"""
    clipPath: str  # 完整路径，如 "CE001 Muddy Puddles/clips/clip_1.mp4"
    videoUrl: str
    originalText: str
    translationCN: Optional[str]
    thumbnail: Optional[str]
    duration: float
    
    class Config:
        from_attributes = True
