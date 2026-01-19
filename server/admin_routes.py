"""
后台管理 API 路由
"""

import os
import uuid
import json
import secrets
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Header
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import (
    get_db, Cartoon, Season, DubbingRecord, AdminToken,
    verify_admin, change_admin_password, AdminUser,
    create_token, get_token, delete_token, cleanup_expired_tokens
)
from schemas import (
    CartoonCreate, CartoonUpdate, CartoonResponse, CartoonListResponse,
    SeasonCreate, SeasonUpdate, SeasonResponse, SeasonListResponse,
    DubbingRecordResponse, StatsResponse
)

router = APIRouter(prefix="/admin", tags=["后台管理"])


def generate_token():
    """生成token"""
    return secrets.token_hex(32)


# ===== 登录认证 =====
@router.post("/login")
def admin_login(
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    """管理员登录"""
    admin = verify_admin(db, username, password)
    
    if admin:
        # 清理过期的 token
        cleanup_expired_tokens(db)
        
        # 生成token
        token = generate_token()
        # 保存token到数据库，有效期7天（服务重启后仍有效）
        expires_at = datetime.utcnow() + timedelta(days=7)
        create_token(db, token, username, expires_at)
        
        return {"success": True, "token": token, "message": "登录成功"}
    else:
        raise HTTPException(status_code=401, detail="用户名或密码错误")


@router.post("/logout")
def admin_logout(authorization: str = Header(None), db: Session = Depends(get_db)):
    """管理员登出"""
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        delete_token(db, token)
    return {"success": True, "message": "已登出"}


@router.get("/verify")
def verify_token_api(authorization: str = Header(None), db: Session = Depends(get_db)):
    """验证token是否有效"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登录")
    
    token = authorization[7:]
    token_data = get_token(db, token)
    
    if not token_data:
        raise HTTPException(status_code=401, detail="token无效")
    
    if datetime.utcnow() > token_data.expires_at:
        delete_token(db, token)
        raise HTTPException(status_code=401, detail="token已过期")
    
    return {"success": True, "username": token_data.username}


@router.post("/change-password")
def api_change_password(
    old_password: str = Form(...),
    new_password: str = Form(...),
    authorization: str = Header(None),
    db: Session = Depends(get_db)
):
    """修改密码（需要登录）"""
    # 验证token
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登录")
    
    token = authorization[7:]
    token_data = get_token(db, token)
    
    if not token_data:
        raise HTTPException(status_code=401, detail="token无效")
    
    if datetime.utcnow() > token_data.expires_at:
        delete_token(db, token)
        raise HTTPException(status_code=401, detail="token已过期")
    
    username = token_data.username
    
    # 验证旧密码
    admin = verify_admin(db, username, old_password)
    if not admin:
        raise HTTPException(status_code=400, detail="原密码错误")
    
    # 修改密码
    if change_admin_password(db, username, new_password):
        return {"success": True, "message": "密码修改成功"}
    else:
        raise HTTPException(status_code=500, detail="密码修改失败")


# 文件上传目录
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ===== 统计 =====
@router.get("/stats", response_model=StatsResponse)
def get_stats(db: Session = Depends(get_db)):
    """获取统计数据"""
    total_cartoons = db.query(Cartoon).count()
    total_seasons = db.query(Season).count()
    total_records = db.query(DubbingRecord).count()
    
    # 最近的配音记录
    recent_records = db.query(DubbingRecord).order_by(
        DubbingRecord.created_at.desc()
    ).limit(10).all()
    
    return StatsResponse(
        total_cartoons=total_cartoons,
        total_seasons=total_seasons,
        total_episodes=0,  # 从 JSON 动态获取，不再统计
        total_clips=0,  # 从 JSON 动态获取，不再统计
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
        result.append(SeasonListResponse(
            id=season.id,
            cartoon_id=season.cartoon_id,
            number=season.number,
            all_json_url=season.all_json_url,
            is_active=season.is_active
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


# ===== 配音记录 =====
@router.get("/records", response_model=List[DubbingRecordResponse])
def list_records(
    clip_path: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """获取配音记录列表"""
    query = db.query(DubbingRecord)
    if clip_path:
        query = query.filter(DubbingRecord.clip_path == clip_path)
    
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


# ===== 数据导出/导入 =====
@router.get("/export")
def export_data(db: Session = Depends(get_db)):
    """导出所有动画片数据为JSON（只包含动画片和季的基本信息）"""
    cartoons = db.query(Cartoon).all()
    
    export_data = []
    for cartoon in cartoons:
        cartoon_data = {
            "id": cartoon.id,
            "name": cartoon.name,
            "name_cn": cartoon.name_cn,
            "thumbnail": cartoon.thumbnail,
            "description": cartoon.description,
            "is_active": cartoon.is_active,
            "seasons": []
        }
        
        seasons = db.query(Season).filter(Season.cartoon_id == cartoon.id).order_by(Season.number).all()
        for season in seasons:
            season_data = {
                "id": season.id,
                "number": season.number,
                "all_json_url": season.all_json_url,
                "is_active": season.is_active
            }
            cartoon_data["seasons"].append(season_data)
        
        export_data.append(cartoon_data)
    
    return {"cartoons": export_data, "version": "2.0"}


@router.post("/import")
async def import_data(
    file: UploadFile = File(...),
    replace: bool = Form(False),  # 是否替换现有数据
    db: Session = Depends(get_db)
):
    """从JSON文件导入动画片数据（只导入动画片和季的基本信息）"""
    try:
        content = await file.read()
        data = json.loads(content.decode('utf-8'))
        
        if "cartoons" not in data:
            raise HTTPException(status_code=400, detail="无效的JSON格式，缺少cartoons字段")
        
        # 如果选择替换，先删除所有现有数据
        if replace:
            db.query(Season).delete()
            db.query(Cartoon).delete()
            db.commit()
        
        imported_count = {
            "cartoons": 0,
            "seasons": 0
        }
        
        for cartoon_data in data["cartoons"]:
            # 检查动画片是否已存在
            existing_cartoon = db.query(Cartoon).filter(Cartoon.id == cartoon_data["id"]).first()
            if existing_cartoon:
                if not replace:
                    continue  # 跳过已存在的
            
            # 创建动画片
            cartoon = Cartoon(
                id=cartoon_data["id"],
                name=cartoon_data.get("name", ""),
                name_cn=cartoon_data.get("name_cn", ""),
                thumbnail=cartoon_data.get("thumbnail"),
                description=cartoon_data.get("description"),
                is_active=cartoon_data.get("is_active", True)
            )
            db.add(cartoon)
            imported_count["cartoons"] += 1
            
            # 导入季
            for season_data in cartoon_data.get("seasons", []):
                season = Season(
                    id=season_data["id"],
                    cartoon_id=cartoon_data["id"],
                    number=season_data.get("number", 1),
                    all_json_url=season_data.get("all_json_url"),
                    is_active=season_data.get("is_active", True)
                )
                db.add(season)
                imported_count["seasons"] += 1
        
        db.commit()
        return {
            "message": "导入成功",
            "imported": imported_count
        }
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="无效的JSON文件")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"导入失败: {str(e)}")
