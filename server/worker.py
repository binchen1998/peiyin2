"""
后台定时任务 Worker
用于定期生成推荐片段等任务
"""

import asyncio
import random
import logging
from datetime import datetime
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from database import (
    get_db_session, Season, RecommendedClip,
    clear_recommended_clips, add_recommended_clip, get_recommended_clips
)

logger = logging.getLogger(__name__)

# Worker 配置
RECOMMENDATION_INTERVAL_SECONDS = 60 * 60  # 1小时
RECOMMENDATION_COUNT = 20  # 生成20个推荐


def get_base_url(all_json_url: str) -> str:
    """从 all.json URL 获取基础 URL"""
    if all_json_url.endswith('/all.json'):
        return all_json_url[:-8]
    return all_json_url.rsplit('/', 1)[0] + '/'


async def generate_recommendations_task(count: int = RECOMMENDATION_COUNT) -> dict:
    """
    生成推荐片段的核心逻辑
    从所有启用的季中随机选择指定数量的片段
    """
    db = get_db_session()
    
    try:
        # 获取所有启用的季
        seasons = db.query(Season).filter(Season.is_active == True).all()
        
        if not seasons:
            logger.warning("没有可用的季，跳过生成推荐")
            return {"success": False, "message": "没有可用的季"}
        
        # 收集所有可用的片段
        all_clips = []
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            for season in seasons:
                if not season.all_json_url:
                    continue
                
                try:
                    # 获取 all.json
                    base_url = get_base_url(season.all_json_url)
                    response = await client.get(season.all_json_url)
                    response.raise_for_status()
                    episodes = response.json()
                    
                    # 遍历每一集
                    for episode in episodes:
                        episode_name = episode.get("name", "")
                        if not episode_name:
                            continue
                        
                        # 获取单集 JSON
                        episode_json_url = f"{base_url}{episode_name}/{episode_name}.json"
                        try:
                            ep_response = await client.get(episode_json_url)
                            ep_response.raise_for_status()
                            episode_data = ep_response.json()
                            
                            # 收集该集的所有片段
                            for clip in episode_data.get("clips", []):
                                clip_path = f"{episode_name}/{clip.get('video_url', '')}"
                                video_url = f"{base_url}{clip_path}"
                                
                                thumbnail = clip.get("thumbnail")
                                if thumbnail:
                                    thumbnail = f"{base_url}{episode_name}/{thumbnail}"
                                
                                all_clips.append({
                                    "season_id": season.id,
                                    "episode_name": episode_name,
                                    "clip_path": clip_path,
                                    "video_url": video_url,
                                    "thumbnail": thumbnail,
                                    "original_text": clip.get("original_text", ""),
                                    "translation_cn": clip.get("translation_cn"),
                                    "duration": clip.get("duration", 0)
                                })
                        except Exception as e:
                            logger.debug(f"获取集 {episode_name} 失败: {e}")
                            continue
                            
                except Exception as e:
                    logger.debug(f"处理季 {season.id} 失败: {e}")
                    continue
        
        if not all_clips:
            logger.warning("没有找到可用的片段，跳过生成推荐")
            return {"success": False, "message": "没有找到可用的片段"}
        
        # 随机选择指定数量的片段
        selected_clips = random.sample(all_clips, min(count, len(all_clips)))
        
        # 清空现有推荐，添加新的
        clear_recommended_clips(db)
        
        for i, clip_data in enumerate(selected_clips):
            clip_data["sort_order"] = i
            add_recommended_clip(db, clip_data)
        
        logger.info(f"成功生成 {len(selected_clips)} 个推荐片段 (总可用: {len(all_clips)})")
        return {
            "success": True,
            "message": f"成功生成 {len(selected_clips)} 个推荐片段",
            "count": len(selected_clips),
            "total_available": len(all_clips)
        }
        
    except Exception as e:
        logger.error(f"生成推荐片段失败: {e}")
        return {"success": False, "message": str(e)}
    finally:
        db.close()


async def recommendation_worker():
    """
    推荐片段生成 Worker
    每隔固定时间自动生成推荐片段
    """
    logger.info(f"推荐片段 Worker 已启动，间隔: {RECOMMENDATION_INTERVAL_SECONDS}秒")
    
    # 启动时先检查是否有推荐，没有则立即生成
    db = get_db_session()
    try:
        existing = get_recommended_clips(db)
        if len(existing) == 0:
            logger.info("检测到没有推荐片段，立即生成...")
            await generate_recommendations_task()
    finally:
        db.close()
    
    # 定时循环
    while True:
        try:
            # 等待指定时间
            await asyncio.sleep(RECOMMENDATION_INTERVAL_SECONDS)
            
            # 执行生成任务
            logger.info(f"[{datetime.now().isoformat()}] 开始定时生成推荐片段...")
            result = await generate_recommendations_task()
            logger.info(f"定时任务完成: {result.get('message', 'unknown')}")
            
        except asyncio.CancelledError:
            logger.info("推荐片段 Worker 被取消")
            break
        except Exception as e:
            logger.error(f"Worker 执行出错: {e}")
            # 出错后等待一段时间再重试
            await asyncio.sleep(60)


# Worker 任务引用，用于停止
_worker_task: Optional[asyncio.Task] = None


def start_worker():
    """启动 Worker"""
    global _worker_task
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(recommendation_worker())
        logger.info("Worker 任务已创建")


def stop_worker():
    """停止 Worker"""
    global _worker_task
    if _worker_task and not _worker_task.done():
        _worker_task.cancel()
        logger.info("Worker 任务已取消")
