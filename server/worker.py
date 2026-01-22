"""
后台定时任务 Worker
用于定期生成推荐片段等任务
"""

import asyncio
import random
import logging
import os
import subprocess
import tempfile
import hashlib
import shutil
from datetime import datetime
from typing import Optional
from pathlib import Path

import httpx
from sqlalchemy.orm import Session

from database import (
    get_db_session, Season, RecommendedClip,
    clear_recommended_clips, add_recommended_clip, get_recommended_clips,
    VocalRemovalTask, get_pending_vocal_removal_tasks, update_vocal_removal_task
)

logger = logging.getLogger(__name__)

# Worker 配置
RECOMMENDATION_INTERVAL_SECONDS = 60 * 60  # 1小时
RECOMMENDATION_COUNT = 20  # 生成20个推荐
VOCAL_REMOVAL_CHECK_INTERVAL = 5  # 每5秒检查一次人声去除任务

# 人声去除相关配置
VOCAL_REMOVAL_OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "vocal_removed")
os.makedirs(VOCAL_REMOVAL_OUTPUT_DIR, exist_ok=True)


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


# ===== 人声去除功能 =====

def get_url_hash(url: str) -> str:
    """生成 URL 的哈希值作为文件名"""
    return hashlib.md5(url.encode()).hexdigest()[:16]


async def download_video(url: str, output_path: str) -> bool:
    """下载视频文件"""
    try:
        async with httpx.AsyncClient(timeout=300.0, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
            with open(output_path, 'wb') as f:
                f.write(response.content)
            logger.info(f"视频下载完成: {output_path}")
            return True
    except Exception as e:
        logger.error(f"下载视频失败: {e}")
        return False


def extract_audio(video_path: str, audio_path: str) -> bool:
    """从视频中提取音频为 MP3"""
    try:
        cmd = [
            'ffmpeg', '-y', '-i', video_path,
            '-vn',  # 不处理视频
            '-acodec', 'libmp3lame',
            '-q:a', '2',  # 高质量
            audio_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            logger.error(f"提取音频失败: {result.stderr}")
            return False
        logger.info(f"音频提取完成: {audio_path}")
        return True
    except Exception as e:
        logger.error(f"提取音频异常: {e}")
        return False


def remove_vocals_with_demucs(audio_path: str, output_dir: str) -> Optional[str]:
    """
    使用 Demucs 分离人声
    返回没有人声的音频路径（accompaniment = bass + drums + other）
    """
    try:
        # 使用 demucs 分离音频
        # 使用 htdemucs 模型，它是预训练的高质量模型
        cmd = [
            'python', '-m', 'demucs',
            '--two-stems', 'vocals',  # 只分离人声和其他
            '-o', output_dir,
            audio_path
        ]
        logger.info(f"执行 Demucs 命令: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            logger.error(f"Demucs 分离失败: {result.stderr}")
            return None
        
        # Demucs 输出结构: output_dir/htdemucs/{filename_without_ext}/no_vocals.wav
        audio_basename = Path(audio_path).stem
        # 尝试多个可能的模型名称
        possible_models = ['htdemucs', 'htdemucs_ft', 'mdx_extra', 'demucs']
        
        no_vocals_path = None
        for model in possible_models:
            candidate = os.path.join(output_dir, model, audio_basename, 'no_vocals.wav')
            if os.path.exists(candidate):
                no_vocals_path = candidate
                break
        
        if no_vocals_path and os.path.exists(no_vocals_path):
            logger.info(f"人声分离完成: {no_vocals_path}")
            return no_vocals_path
        else:
            # 列出输出目录内容以便调试
            logger.error(f"未找到分离后的音频文件，输出目录: {output_dir}")
            for root, dirs, files in os.walk(output_dir):
                for f in files:
                    logger.info(f"  发现文件: {os.path.join(root, f)}")
            return None
            
    except Exception as e:
        logger.error(f"Demucs 分离异常: {e}")
        return None


def merge_audio_to_video(video_path: str, audio_path: str, output_path: str) -> bool:
    """将新的音频合成到视频中"""
    try:
        cmd = [
            'ffmpeg', '-y',
            '-i', video_path,  # 输入视频
            '-i', audio_path,  # 输入音频
            '-c:v', 'copy',  # 复制视频流
            '-c:a', 'aac',  # 音频编码为 AAC
            '-map', '0:v:0',  # 使用第一个输入的视频流
            '-map', '1:a:0',  # 使用第二个输入的音频流
            '-shortest',  # 以最短的流为准
            output_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            logger.error(f"合成视频失败: {result.stderr}")
            return False
        logger.info(f"视频合成完成: {output_path}")
        return True
    except Exception as e:
        logger.error(f"合成视频异常: {e}")
        return False


async def process_vocal_removal_task(task: VocalRemovalTask) -> dict:
    """
    处理单个人声去除任务
    
    流程：
    1. 下载视频
    2. 提取音频为 MP3
    3. 使用 Demucs 分离出无人声版本
    4. 将无人声音频合成到视频
    5. 返回处理后的视频路径
    """
    db = get_db_session()
    
    try:
        # 更新状态为处理中
        update_vocal_removal_task(db, task.id, status="processing")
        
        # 创建临时工作目录
        url_hash = get_url_hash(task.video_url)
        work_dir = tempfile.mkdtemp(prefix=f"vocal_removal_{url_hash}_")
        
        try:
            # 1. 下载视频
            video_ext = Path(task.video_url).suffix or '.mp4'
            downloaded_video = os.path.join(work_dir, f"original{video_ext}")
            
            logger.info(f"开始下载视频: {task.video_url}")
            if not await download_video(task.video_url, downloaded_video):
                raise Exception("下载视频失败")
            
            # 2. 提取音频
            audio_path = os.path.join(work_dir, "audio.mp3")
            logger.info(f"开始提取音频...")
            if not extract_audio(downloaded_video, audio_path):
                raise Exception("提取音频失败")
            
            # 3. 使用 Demucs 分离人声
            demucs_output_dir = os.path.join(work_dir, "demucs_output")
            os.makedirs(demucs_output_dir, exist_ok=True)
            
            logger.info(f"开始分离人声...")
            no_vocals_path = remove_vocals_with_demucs(audio_path, demucs_output_dir)
            if not no_vocals_path:
                raise Exception("人声分离失败")
            
            # 4. 合成新视频
            output_filename = f"{url_hash}_no_vocals{video_ext}"
            output_video_path = os.path.join(VOCAL_REMOVAL_OUTPUT_DIR, output_filename)
            
            logger.info(f"开始合成无人声视频...")
            if not merge_audio_to_video(downloaded_video, no_vocals_path, output_video_path):
                raise Exception("合成视频失败")
            
            # 5. 更新任务状态为完成
            # 返回相对路径，便于构建 URL
            relative_path = f"/vocal_removed/{output_filename}"
            update_vocal_removal_task(
                db, task.id, 
                status="completed", 
                output_video_path=relative_path
            )
            
            logger.info(f"任务完成: {task.video_url} -> {relative_path}")
            return {"success": True, "output_path": relative_path}
            
        finally:
            # 清理临时目录
            try:
                shutil.rmtree(work_dir)
            except Exception as e:
                logger.warning(f"清理临时目录失败: {e}")
                
    except Exception as e:
        error_msg = str(e)
        logger.error(f"处理任务失败: {error_msg}")
        update_vocal_removal_task(db, task.id, status="failed", error_message=error_msg)
        return {"success": False, "error": error_msg}
    finally:
        db.close()


async def vocal_removal_worker():
    """
    人声去除 Worker
    定期检查待处理的任务并执行
    """
    logger.info("人声去除 Worker 已启动")
    
    while True:
        try:
            # 检查待处理的任务
            db = get_db_session()
            try:
                pending_tasks = get_pending_vocal_removal_tasks(db)
                
                for task in pending_tasks:
                    logger.info(f"发现待处理任务: {task.video_url}")
                    await process_vocal_removal_task(task)
                    
            finally:
                db.close()
            
            # 等待一段时间再检查
            await asyncio.sleep(VOCAL_REMOVAL_CHECK_INTERVAL)
            
        except asyncio.CancelledError:
            logger.info("人声去除 Worker 被取消")
            break
        except Exception as e:
            logger.error(f"人声去除 Worker 执行出错: {e}")
            await asyncio.sleep(10)


# Worker 任务引用，用于停止
_worker_task: Optional[asyncio.Task] = None
_vocal_removal_worker_task: Optional[asyncio.Task] = None


def start_worker():
    """启动 Worker"""
    global _worker_task, _vocal_removal_worker_task
    
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(recommendation_worker())
        logger.info("推荐片段 Worker 任务已创建")
    
    if _vocal_removal_worker_task is None or _vocal_removal_worker_task.done():
        _vocal_removal_worker_task = asyncio.create_task(vocal_removal_worker())
        logger.info("人声去除 Worker 任务已创建")


def stop_worker():
    """停止 Worker"""
    global _worker_task, _vocal_removal_worker_task
    
    if _worker_task and not _worker_task.done():
        _worker_task.cancel()
        logger.info("推荐片段 Worker 任务已取消")
    
    if _vocal_removal_worker_task and not _vocal_removal_worker_task.done():
        _vocal_removal_worker_task.cancel()
        logger.info("人声去除 Worker 任务已取消")
