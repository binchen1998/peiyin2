"""
数据库模型和操作
支持 SQLite 和 MySQL
"""

import os
import hashlib
from datetime import datetime
from typing import List, Optional

# 尝试加载 .env 文件
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from sqlalchemy import create_engine, Column, Integer, String, Float, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, Session


def get_database_url():
    """获取数据库连接URL"""
    # 如果直接指定了 DATABASE_URL，使用它
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        return database_url
    
    # 根据 DATABASE_TYPE 构建连接URL
    db_type = os.environ.get("DATABASE_TYPE", "sqlite").lower()
    
    if db_type == "mysql":
        host = os.environ.get("DATABASE_HOST", "localhost")
        port = os.environ.get("DATABASE_PORT", "3306")
        name = os.environ.get("DATABASE_NAME", "peiyin")
        user = os.environ.get("DATABASE_USER", "root")
        password = os.environ.get("DATABASE_PASSWORD", "")
        return f"mysql+pymysql://{user}:{password}@{host}:{port}/{name}?charset=utf8mb4"
    else:
        # 默认使用 SQLite
        db_path = os.environ.get("DATABASE_PATH", "./peiyin.db")
        return f"sqlite:///{db_path}"


# 数据库配置
DATABASE_URL = get_database_url()

# 根据数据库类型设置连接参数
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=3600)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def hash_password(password: str) -> str:
    """对密码进行哈希"""
    return hashlib.sha256(password.encode()).hexdigest()


# ===== 数据库模型 =====

class AdminUser(Base):
    """管理员用户"""
    __tablename__ = "admin_users"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(64), nullable=False)  # SHA256 hash
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Cartoon(Base):
    """动画片"""
    __tablename__ = "cartoons"
    
    id = Column(String(50), primary_key=True)
    name = Column(String(100), nullable=False)  # 英文名
    name_cn = Column(String(100), nullable=False)  # 中文名
    thumbnail = Column(String(500))  # 缩略图URL
    description = Column(Text)  # 描述
    is_active = Column(Boolean, default=True)  # 是否启用
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    seasons = relationship("Season", back_populates="cartoon", cascade="all, delete-orphan")


class Season(Base):
    """季"""
    __tablename__ = "seasons"
    
    id = Column(String(50), primary_key=True)
    cartoon_id = Column(String(50), ForeignKey("cartoons.id"), nullable=False)
    number = Column(Integer, nullable=False)  # 第几季
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    cartoon = relationship("Cartoon", back_populates="seasons")
    episodes = relationship("Episode", back_populates="season", cascade="all, delete-orphan")


class Episode(Base):
    """集"""
    __tablename__ = "episodes"
    
    id = Column(String(50), primary_key=True)
    season_id = Column(String(50), ForeignKey("seasons.id"), nullable=False)
    number = Column(Integer, nullable=False)  # 第几集
    title = Column(String(200))  # 英文标题
    title_cn = Column(String(200))  # 中文标题
    thumbnail = Column(String(500))  # 缩略图URL
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    season = relationship("Season", back_populates="episodes")
    clips = relationship("DubbingClip", back_populates="episode", cascade="all, delete-orphan")


class DubbingClip(Base):
    """配音片段"""
    __tablename__ = "dubbing_clips"
    
    id = Column(String(50), primary_key=True)
    episode_id = Column(String(50), ForeignKey("episodes.id"), nullable=False)
    order = Column(Integer, nullable=False)  # 顺序
    video_url = Column(String(500))  # 视频URL
    original_text = Column(Text, nullable=False)  # 原文
    translation_cn = Column(Text)  # 中文翻译
    start_time = Column(Float, default=0)  # 开始时间(秒)
    end_time = Column(Float, default=0)  # 结束时间(秒)
    character = Column(String(100))  # 角色名
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    episode = relationship("Episode", back_populates="clips")
    records = relationship("DubbingRecord", back_populates="clip", cascade="all, delete-orphan")


class DubbingRecord(Base):
    """配音记录"""
    __tablename__ = "dubbing_records"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    clip_id = Column(String(50), ForeignKey("dubbing_clips.id"), nullable=False)
    user_id = Column(String(50))  # 用户ID（可选）
    audio_url = Column(String(500))  # 录音URL
    score = Column(Integer)  # 总分
    feedback = Column(Text)  # 反馈
    word_scores = Column(Text)  # 单词评分JSON
    created_at = Column(DateTime, default=datetime.utcnow)
    
    clip = relationship("DubbingClip", back_populates="records")


# ===== 数据库操作 =====

def init_db():
    """初始化数据库"""
    Base.metadata.create_all(bind=engine)


def get_db():
    """获取数据库会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db_session():
    """获取数据库会话（非生成器版本）"""
    return SessionLocal()


def init_admin_user(db: Session):
    """初始化默认管理员用户"""
    # 检查是否已有管理员
    if db.query(AdminUser).count() > 0:
        return
    
    # 创建默认管理员
    admin = AdminUser(
        username="admin",
        password_hash=hash_password("admin123"),
        is_active=True
    )
    db.add(admin)
    db.commit()
    print("默认管理员用户已创建: admin / admin123")


def verify_admin(db: Session, username: str, password: str) -> Optional[AdminUser]:
    """验证管理员登录"""
    password_hash = hash_password(password)
    return db.query(AdminUser).filter(
        AdminUser.username == username,
        AdminUser.password_hash == password_hash,
        AdminUser.is_active == True
    ).first()


def change_admin_password(db: Session, username: str, new_password: str) -> bool:
    """修改管理员密码"""
    admin = db.query(AdminUser).filter(AdminUser.username == username).first()
    if admin:
        admin.password_hash = hash_password(new_password)
        db.commit()
        return True
    return False


def change_admin_username(db: Session, old_username: str, new_username: str) -> bool:
    """修改管理员用户名"""
    # 检查新用户名是否已存在
    existing = db.query(AdminUser).filter(AdminUser.username == new_username).first()
    if existing:
        return False
    
    admin = db.query(AdminUser).filter(AdminUser.username == old_username).first()
    if admin:
        admin.username = new_username
        db.commit()
        return True
    return False


def create_admin_user(db: Session, username: str, password: str) -> Optional[AdminUser]:
    """创建新管理员用户"""
    # 检查用户名是否已存在
    existing = db.query(AdminUser).filter(AdminUser.username == username).first()
    if existing:
        return None
    
    admin = AdminUser(
        username=username,
        password_hash=hash_password(password),
        is_active=True
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


# 初始化示例数据
def init_sample_data(db: Session):
    """初始化示例数据"""
    # 初始化管理员
    init_admin_user(db)
    
    # 检查是否已有数据
    if db.query(Cartoon).count() > 0:
        return
    
    # 创建示例动画片
    cartoons_data = [
        {
            "id": "peppa-pig",
            "name": "Peppa Pig",
            "name_cn": "小猪佩奇",
            "thumbnail": "https://picsum.photos/seed/peppa/300/200",
            "description": "A lovely pig family story"
        },
        {
            "id": "paw-patrol",
            "name": "PAW Patrol",
            "name_cn": "汪汪队立大功",
            "thumbnail": "https://picsum.photos/seed/paw/300/200",
            "description": "Brave puppies save the day"
        },
        {
            "id": "frozen",
            "name": "Frozen",
            "name_cn": "冰雪奇缘",
            "thumbnail": "https://picsum.photos/seed/frozen/300/200",
            "description": "A magical winter adventure"
        },
    ]
    
    for data in cartoons_data:
        cartoon = Cartoon(**data)
        db.add(cartoon)
    
    db.commit()
    
    # 创建季节
    seasons_data = [
        {"id": "peppa-s1", "cartoon_id": "peppa-pig", "number": 1},
        {"id": "peppa-s2", "cartoon_id": "peppa-pig", "number": 2},
        {"id": "paw-s1", "cartoon_id": "paw-patrol", "number": 1},
        {"id": "frozen-s1", "cartoon_id": "frozen", "number": 1},
    ]
    
    for data in seasons_data:
        season = Season(**data)
        db.add(season)
    
    db.commit()
    
    # 创建集数
    episodes_data = [
        {"id": "peppa-s1-e1", "season_id": "peppa-s1", "number": 1, "title": "Muddy Puddles", "title_cn": "泥坑", "thumbnail": "https://picsum.photos/seed/peppa1/300/200"},
        {"id": "peppa-s1-e2", "season_id": "peppa-s1", "number": 2, "title": "Mr Dinosaur is Lost", "title_cn": "恐龙先生不见了", "thumbnail": "https://picsum.photos/seed/peppa2/300/200"},
        {"id": "peppa-s1-e3", "season_id": "peppa-s1", "number": 3, "title": "Best Friend", "title_cn": "最好的朋友", "thumbnail": "https://picsum.photos/seed/peppa3/300/200"},
        {"id": "paw-s1-e1", "season_id": "paw-s1", "number": 1, "title": "Pups Make a Splash", "title_cn": "狗狗们溅起水花", "thumbnail": "https://picsum.photos/seed/paw1/300/200"},
        {"id": "frozen-s1-e1", "season_id": "frozen-s1", "number": 1, "title": "Let It Go", "title_cn": "随它吧", "thumbnail": "https://picsum.photos/seed/frozen1/300/200"},
    ]
    
    for data in episodes_data:
        episode = Episode(**data)
        db.add(episode)
    
    db.commit()
    
    # 创建配音片段
    clips_data = [
        {
            "id": "clip-1",
            "episode_id": "peppa-s1-e1",
            "order": 1,
            "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
            "original_text": "I am Peppa Pig.",
            "translation_cn": "我是小猪佩奇。",
            "start_time": 0,
            "end_time": 3,
            "character": "Peppa"
        },
        {
            "id": "clip-2",
            "episode_id": "peppa-s1-e1",
            "order": 2,
            "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
            "original_text": "This is my little brother George.",
            "translation_cn": "这是我的弟弟乔治。",
            "start_time": 3,
            "end_time": 6,
            "character": "Peppa"
        },
        {
            "id": "clip-3",
            "episode_id": "peppa-s1-e1",
            "order": 3,
            "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
            "original_text": "I love jumping in muddy puddles!",
            "translation_cn": "我喜欢在泥坑里跳！",
            "start_time": 6,
            "end_time": 10,
            "character": "Peppa"
        },
        {
            "id": "clip-4",
            "episode_id": "paw-s1-e1",
            "order": 1,
            "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
            "original_text": "No job is too big, no pup is too small!",
            "translation_cn": "没有什么任务太大，没有什么狗狗太小！",
            "start_time": 0,
            "end_time": 4,
            "character": "Ryder"
        },
        {
            "id": "clip-5",
            "episode_id": "frozen-s1-e1",
            "order": 1,
            "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
            "original_text": "Let it go, let it go!",
            "translation_cn": "随它吧，随它吧！",
            "start_time": 0,
            "end_time": 4,
            "character": "Elsa"
        },
    ]
    
    for data in clips_data:
        clip = DubbingClip(**data)
        db.add(clip)
    
    db.commit()
    print("示例数据初始化完成")
