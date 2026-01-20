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


class AdminToken(Base):
    """管理员登录Token（持久化存储，服务重启后仍有效）"""
    __tablename__ = "admin_tokens"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    username = Column(String(50), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Cartoon(Base):
    """动画片"""
    __tablename__ = "cartoons"
    
    id = Column(String(50), primary_key=True)
    name = Column(String(100), nullable=False)  # 英文名
    name_cn = Column(String(100), nullable=False)  # 中文名
    thumbnail = Column(String(500))  # 缩略图URL
    description = Column(Text)  # 描述
    is_active = Column(Boolean, default=True)  # 是否启用
    is_featured = Column(Boolean, default=False)  # 是否在首页显示
    sort_order = Column(Integer, default=0)  # 排序顺序（越小越靠前）
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    seasons = relationship("Season", back_populates="cartoon", cascade="all, delete-orphan")


class Season(Base):
    """季"""
    __tablename__ = "seasons"
    
    id = Column(String(50), primary_key=True)
    cartoon_id = Column(String(50), ForeignKey("cartoons.id"), nullable=False)
    number = Column(Integer, nullable=False)  # 第几季
    all_json_url = Column(String(500))  # all.json 的 URL，用于获取所有集的信息
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    cartoon = relationship("Cartoon", back_populates="seasons")


class DubbingRecord(Base):
    """配音记录"""
    __tablename__ = "dubbing_records"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    clip_path = Column(String(500), nullable=False)  # clip 的完整路径，如 "CE001/clips/clip_1.mp4"
    season_id = Column(String(50))  # 季ID，用于跳转回配音页面
    user_id = Column(String(50))  # 用户ID（可选）
    audio_url = Column(String(500))  # 录音URL
    score = Column(Integer)  # 总分
    feedback = Column(Text)  # 反馈
    word_scores = Column(Text)  # 单词评分JSON
    created_at = Column(DateTime, default=datetime.utcnow)


class RecommendedClip(Base):
    """首页推荐片段（由后台随机生成，所有用户看到相同内容）"""
    __tablename__ = "recommended_clips"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    season_id = Column(String(50), nullable=False)  # 季ID
    episode_name = Column(String(200), nullable=False)  # 集名称
    clip_path = Column(String(500), nullable=False)  # clip 路径
    video_url = Column(String(500), nullable=False)  # 视频URL
    thumbnail = Column(String(500))  # 缩略图URL
    original_text = Column(String(500))  # 原文
    translation_cn = Column(String(500))  # 中文翻译
    duration = Column(Float, default=0)  # 时长
    sort_order = Column(Integer, default=0)  # 排序
    created_at = Column(DateTime, default=datetime.utcnow)


# ===== 数据库操作 =====

def migrate_db():
    """数据库迁移 - 添加缺失的列并处理表结构变更"""
    from sqlalchemy import inspect, text
    
    inspector = inspect(engine)
    
    # 检查 cartoons 表是否存在
    if 'cartoons' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('cartoons')]
        
        # 添加 is_featured 列（如果不存在）
        if 'is_featured' not in columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE cartoons ADD COLUMN is_featured BOOLEAN DEFAULT 0"))
                conn.commit()
                print("数据库迁移: 已添加 cartoons.is_featured 列")
        
        # 添加 sort_order 列（如果不存在）
        if 'sort_order' not in columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE cartoons ADD COLUMN sort_order INTEGER DEFAULT 0"))
                conn.commit()
                print("数据库迁移: 已添加 cartoons.sort_order 列")
    
    # 检查 seasons 表是否存在
    if 'seasons' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('seasons')]
        
        # 添加 all_json_url 列（如果不存在）
        if 'all_json_url' not in columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE seasons ADD COLUMN all_json_url VARCHAR(500)"))
                conn.commit()
                print("数据库迁移: 已添加 seasons.all_json_url 列")
    
    # 检查 dubbing_records 表是否存在
    if 'dubbing_records' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('dubbing_records')]
        
        # 检查是否需要重建表（如果有 clip_id 列且是 NOT NULL）
        if 'clip_id' in columns:
            print("数据库迁移: 检测到旧的 clip_id 列，需要重建 dubbing_records 表")
            with engine.connect() as conn:
                # SQLite 不支持删除列，需要重建表
                # 1. 创建新表
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS dubbing_records_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        clip_path VARCHAR(500) NOT NULL,
                        user_id VARCHAR(50),
                        audio_url VARCHAR(500),
                        score INTEGER,
                        feedback TEXT,
                        word_scores TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                
                # 2. 迁移数据（使用 clip_id 或 clip_path）
                if 'clip_path' in columns:
                    conn.execute(text("""
                        INSERT INTO dubbing_records_new (id, clip_path, user_id, audio_url, score, feedback, word_scores, created_at)
                        SELECT id, COALESCE(clip_path, clip_id), user_id, audio_url, score, feedback, word_scores, created_at
                        FROM dubbing_records
                    """))
                else:
                    conn.execute(text("""
                        INSERT INTO dubbing_records_new (id, clip_path, user_id, audio_url, score, feedback, word_scores, created_at)
                        SELECT id, clip_id, user_id, audio_url, score, feedback, word_scores, created_at
                        FROM dubbing_records
                    """))
                
                # 3. 删除旧表
                conn.execute(text("DROP TABLE dubbing_records"))
                
                # 4. 重命名新表
                conn.execute(text("ALTER TABLE dubbing_records_new RENAME TO dubbing_records"))
                
                conn.commit()
                print("数据库迁移: 已重建 dubbing_records 表，移除了 clip_id 列")
        
        # 如果没有 clip_id 但也没有 clip_path，添加 clip_path
        elif 'clip_path' not in columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE dubbing_records ADD COLUMN clip_path VARCHAR(500)"))
                conn.commit()
                print("数据库迁移: 已添加 dubbing_records.clip_path 列")
        
        # 添加 season_id 列（如果不存在）
        if 'season_id' not in columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE dubbing_records ADD COLUMN season_id VARCHAR(50)"))
                conn.commit()
                print("数据库迁移: 已添加 dubbing_records.season_id 列")


def init_db():
    """初始化数据库"""
    Base.metadata.create_all(bind=engine)
    # 执行数据库迁移
    migrate_db()


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


# ===== Token 管理 =====
def create_token(db: Session, token: str, username: str, expires_at: datetime) -> AdminToken:
    """创建新的登录 token"""
    admin_token = AdminToken(
        token=token,
        username=username,
        expires_at=expires_at
    )
    db.add(admin_token)
    db.commit()
    return admin_token


def get_token(db: Session, token: str) -> Optional[AdminToken]:
    """获取 token 信息"""
    return db.query(AdminToken).filter(AdminToken.token == token).first()


def delete_token(db: Session, token: str) -> bool:
    """删除 token"""
    result = db.query(AdminToken).filter(AdminToken.token == token).delete()
    db.commit()
    return result > 0


def cleanup_expired_tokens(db: Session):
    """清理过期的 token"""
    db.query(AdminToken).filter(AdminToken.expires_at < datetime.utcnow()).delete()
    db.commit()


# ===== 推荐片段管理 =====
def clear_recommended_clips(db: Session):
    """清空所有推荐片段"""
    db.query(RecommendedClip).delete()
    db.commit()


def add_recommended_clip(db: Session, clip_data: dict) -> RecommendedClip:
    """添加推荐片段"""
    clip = RecommendedClip(**clip_data)
    db.add(clip)
    db.commit()
    return clip


def get_recommended_clips(db: Session) -> list:
    """获取所有推荐片段"""
    return db.query(RecommendedClip).order_by(RecommendedClip.sort_order).all()


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
    
    # 创建季节（包含 all_json_url）
    seasons_data = [
        {"id": "peppa-s1", "cartoon_id": "peppa-pig", "number": 1, "all_json_url": "https://example.com/peppa-pig/s1/all.json"},
        {"id": "peppa-s2", "cartoon_id": "peppa-pig", "number": 2, "all_json_url": "https://example.com/peppa-pig/s2/all.json"},
        {"id": "paw-s1", "cartoon_id": "paw-patrol", "number": 1, "all_json_url": "https://example.com/paw-patrol/s1/all.json"},
        {"id": "frozen-s1", "cartoon_id": "frozen", "number": 1, "all_json_url": "https://example.com/frozen/s1/all.json"},
    ]
    
    for data in seasons_data:
        season = Season(**data)
        db.add(season)
    
    db.commit()
    print("示例数据初始化完成")
