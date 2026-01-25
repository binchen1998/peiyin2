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
    VocalRemovalTask, get_pending_vocal_removal_tasks, update_vocal_removal_task,
    cleanup_failed_vocal_removal_tasks,
    MediaCache, get_media_cache, create_media_cache, get_media_cache_by_url_and_type,
    UserDubbing, get_pending_user_dubbings, update_user_dubbing, cleanup_failed_user_dubbings
)

logger = logging.getLogger(__name__)

# Worker 配置
RECOMMENDATION_INTERVAL_SECONDS = 60 * 60  # 1小时
RECOMMENDATION_COUNT = 20  # 生成20个推荐
VOCAL_REMOVAL_CHECK_INTERVAL = 1  # 每1秒检查一次人声去除任务
COMPOSITE_VIDEO_CHECK_INTERVAL = 1  # 每1秒检查一次视频合成任务

# 人声去除相关配置
VOCAL_REMOVAL_OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "vocal_removed")
os.makedirs(VOCAL_REMOVAL_OUTPUT_DIR, exist_ok=True)

# 媒体缓存相关配置
MEDIA_CACHE_DIR = os.path.join(os.path.dirname(__file__), "media_cache")
BACKGROUND_CACHE_DIR = os.path.join(MEDIA_CACHE_DIR, "background")
MUTE_VIDEO_CACHE_DIR = os.path.join(MEDIA_CACHE_DIR, "mute_video")
USER_AUDIO_DIR = os.path.join(os.path.dirname(__file__), "user_audio")
USER_VIDEOS_DIR = os.path.join(os.path.dirname(__file__), "user_videos")
USER_DUBBINGS_DIR = os.path.join(os.path.dirname(__file__), "user_dubbings")
os.makedirs(BACKGROUND_CACHE_DIR, exist_ok=True)
os.makedirs(MUTE_VIDEO_CACHE_DIR, exist_ok=True)
os.makedirs(USER_VIDEOS_DIR, exist_ok=True)
os.makedirs(USER_DUBBINGS_DIR, exist_ok=True)


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
    
    # 启动时清理失败的任务，允许重新处理
    db = get_db_session()
    try:
        deleted_count = cleanup_failed_vocal_removal_tasks(db)
        if deleted_count > 0:
            logger.info(f"已清理 {deleted_count} 个失败的人声去除任务")
    finally:
        db.close()
    
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


# ===== 视频合成功能 =====

def get_cache_key(video_url: str, cache_type: str) -> str:
    """生成缓存key"""
    url_hash = get_url_hash(video_url)
    return f"{url_hash}:{cache_type}"


def create_mute_video(video_path: str, output_path: str) -> bool:
    """创建无声视频（移除音轨）"""
    try:
        cmd = [
            'ffmpeg', '-y',
            '-i', video_path,
            '-c:v', 'copy',
            '-an',  # 移除音轨
            output_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            logger.error(f"创建无声视频失败: {result.stderr}")
            return False
        logger.info(f"无声视频创建完成: {output_path}")
        return True
    except Exception as e:
        logger.error(f"创建无声视频异常: {e}")
        return False


def merge_audio_files(audio1_path: str, audio2_path: str, output_path: str) -> bool:
    """合并两个音频文件（混音）"""
    try:
        cmd = [
            'ffmpeg', '-y',
            '-i', audio1_path,
            '-i', audio2_path,
            '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=longest[out]',
            '-map', '[out]',
            '-c:a', 'aac',
            output_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            logger.error(f"合并音频失败: {result.stderr}")
            return False
        logger.info(f"音频合并完成: {output_path}")
        return True
    except Exception as e:
        logger.error(f"合并音频异常: {e}")
        return False


def stack_videos_vertical(top_video: str, bottom_video: str, output_path: str, 
                          output_width: int = 720) -> bool:
    """
    上下拼接两个视频，生成竖版视频
    
    两个视频都拉伸为正方形（720x720），上下拼接成 720x1440 的视频
    无黑边，视频会被拉伸填充
    
    Args:
        top_video: 上方视频路径（动画视频）
        bottom_video: 下方视频路径（用户录制的视频）
        output_path: 输出视频路径
        output_width: 输出宽度（默认720）
    
    Returns:
        是否成功
    """
    try:
        # 每个视频都是正方形，宽高相同
        square_size = output_width  # 720x720
        
        # 使用 ffmpeg 进行上下拼接
        # 1. 将两个视频强制缩放为正方形（拉伸填充，无黑边）
        # 2. 垂直堆叠
        # 3. 使用下方视频（用户录制）的音频
        cmd = [
            'ffmpeg', '-y',
            '-i', top_video,
            '-i', bottom_video,
            '-filter_complex',
            # 强制拉伸为正方形，不保持宽高比（无黑边）
            f'[0:v]scale={square_size}:{square_size}:force_original_aspect_ratio=0[top];'
            f'[1:v]scale={square_size}:{square_size}:force_original_aspect_ratio=0[bottom];'
            f'[top][bottom]vstack=inputs=2[v]',
            '-map', '[v]',
            '-map', '1:a?',  # 使用下方视频（用户录制）的音频
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'aac',
            '-shortest',
            output_path
        ]
        
        logger.info(f"执行视频拼接命令: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            logger.error(f"视频拼接失败: {result.stderr}")
            return False
        
        logger.info(f"视频拼接完成: {output_path} (720x1440)")
        return True
        
    except Exception as e:
        logger.error(f"视频拼接异常: {e}")
        return False


def get_mute_video_from_url(video_url: str, work_dir: str) -> Optional[str]:
    """
    从URL获取或下载无声视频
    返回无声视频的本地路径
    """
    # 这里简化处理，直接下载并创建无声版本
    url_hash = get_url_hash(video_url)
    video_ext = Path(video_url).suffix or '.mp4'
    
    # 检查缓存
    cached_mute_path = os.path.join(MUTE_VIDEO_CACHE_DIR, f"{url_hash}_mute{video_ext}")
    if os.path.exists(cached_mute_path):
        logger.info(f"使用缓存的无声视频: {cached_mute_path}")
        return cached_mute_path
    
    return None  # 需要下载并处理


async def get_or_create_background_and_mute_video(video_url: str) -> tuple:
    """
    获取或创建背景音和无声视频
    返回: (background_audio_path, mute_video_path) 或 (None, None) 如果失败
    """
    db = get_db_session()
    
    try:
        url_hash = get_url_hash(video_url)
        
        # 检查缓存
        bg_cache_key = f"{url_hash}:background"
        mute_cache_key = f"{url_hash}:mute-video"
        
        bg_cache = get_media_cache(db, bg_cache_key)
        mute_cache = get_media_cache(db, mute_cache_key)
        
        # 如果两个缓存都存在，直接返回
        if bg_cache and mute_cache:
            bg_path = os.path.join(os.path.dirname(__file__), bg_cache.file_path.lstrip('/'))
            mute_path = os.path.join(os.path.dirname(__file__), mute_cache.file_path.lstrip('/'))
            if os.path.exists(bg_path) and os.path.exists(mute_path):
                logger.info(f"使用缓存的背景音和无声视频: {video_url}")
                return (bg_path, mute_path)
        
        # 需要创建缓存
        logger.info(f"创建背景音和无声视频缓存: {video_url}")
        
        # 创建临时工作目录
        work_dir = tempfile.mkdtemp(prefix=f"composite_{url_hash}_")
        
        try:
            # 1. 下载视频
            video_ext = Path(video_url).suffix or '.mp4'
            downloaded_video = os.path.join(work_dir, f"original{video_ext}")
            
            if not await download_video(video_url, downloaded_video):
                raise Exception("下载视频失败")
            
            # 2. 提取音频
            audio_path = os.path.join(work_dir, "audio.mp3")
            if not extract_audio(downloaded_video, audio_path):
                raise Exception("提取音频失败")
            
            # 3. 使用 Demucs 分离人声
            demucs_output_dir = os.path.join(work_dir, "demucs_output")
            os.makedirs(demucs_output_dir, exist_ok=True)
            
            no_vocals_path = remove_vocals_with_demucs(audio_path, demucs_output_dir)
            if not no_vocals_path:
                raise Exception("人声分离失败")
            
            # 4. 保存背景音到缓存
            bg_filename = f"{url_hash}_background.wav"
            bg_output_path = os.path.join(BACKGROUND_CACHE_DIR, bg_filename)
            shutil.copy(no_vocals_path, bg_output_path)
            
            # 创建背景音缓存记录
            if not bg_cache:
                create_media_cache(
                    db, bg_cache_key, "background",
                    f"/media_cache/background/{bg_filename}", video_url
                )
            
            # 5. 创建无声视频
            mute_filename = f"{url_hash}_mute{video_ext}"
            mute_output_path = os.path.join(MUTE_VIDEO_CACHE_DIR, mute_filename)
            
            if not create_mute_video(downloaded_video, mute_output_path):
                raise Exception("创建无声视频失败")
            
            # 创建无声视频缓存记录
            if not mute_cache:
                create_media_cache(
                    db, mute_cache_key, "mute-video",
                    f"/media_cache/mute_video/{mute_filename}", video_url
                )
            
            logger.info(f"缓存创建完成: {video_url}")
            return (bg_output_path, mute_output_path)
            
        finally:
            # 清理临时目录
            try:
                shutil.rmtree(work_dir)
            except Exception as e:
                logger.warning(f"清理临时目录失败: {e}")
                
    except Exception as e:
        logger.error(f"获取或创建缓存失败: {e}")
        return (None, None)
    finally:
        db.close()


async def process_composite_video_task(task: UserDubbing) -> dict:
    """
    处理视频合成任务
    
    支持两种模式：
    1. audio (录音配音模式):
       - 获取或创建背景音和无声视频
       - 合并用户配音和背景音
       - 将合成音频与无声视频合成
    
    2. video (视频配音模式):
       - 下载原视频
       - 上下拼接原视频和用户视频
       - 生成竖版720p视频
    """
    db = get_db_session()
    
    # 获取任务模式（兼容旧数据，默认 audio）
    mode = getattr(task, 'mode', None) or 'audio'
    
    try:
        # 更新状态为处理中
        update_user_dubbing(db, task.id, status="processing")
        
        # 创建临时工作目录
        url_hash = get_url_hash(task.original_video_url)
        work_dir = tempfile.mkdtemp(prefix=f"composite_final_{url_hash}_")
        
        try:
            logger.info(f"开始处理合成任务: {task.id}, 模式: {mode}")
            
            if mode == "video":
                # ===== 视频配音模式 =====
                output_path = await process_video_dubbing_task(task, work_dir)
            else:
                # ===== 录音配音模式 =====
                output_path = await process_audio_dubbing_task(task, work_dir)
            
            # 更新任务状态为完成
            update_user_dubbing(
                db, task.id,
                status="completed",
                composite_video_path=output_path
            )
            
            logger.info(f"合成任务完成: {task.id} -> {output_path}")
            return {"success": True, "output_path": output_path}
            
        finally:
            # 清理临时目录
            try:
                shutil.rmtree(work_dir)
            except Exception as e:
                logger.warning(f"清理临时目录失败: {e}")
                
    except Exception as e:
        error_msg = str(e)
        logger.error(f"处理合成任务失败: {error_msg}")
        update_user_dubbing(db, task.id, status="failed", error_message=error_msg)
        return {"success": False, "error": error_msg}
    finally:
        db.close()


async def process_audio_dubbing_task(task: UserDubbing, work_dir: str) -> str:
    """
    处理录音配音任务
    
    流程：
    1. 获取或创建背景音和无声视频
    2. 合并用户配音和背景音
    3. 将合成音频与无声视频合成
    4. 返回最终视频路径
    """
    # 1. 获取或创建背景音和无声视频
    bg_audio_path, mute_video_path = await get_or_create_background_and_mute_video(task.original_video_url)
    
    if not bg_audio_path or not mute_video_path:
        raise Exception("获取背景音或无声视频失败")
    
    # 2. 获取用户录音路径
    user_audio_path = os.path.join(os.path.dirname(__file__), task.user_audio_path.lstrip('/'))
    if not os.path.exists(user_audio_path):
        raise Exception(f"用户录音文件不存在: {user_audio_path}")
    
    # 3. 合并用户配音和背景音
    merged_audio_path = os.path.join(work_dir, "merged_audio.aac")
    if not merge_audio_files(user_audio_path, bg_audio_path, merged_audio_path):
        raise Exception("合并音频失败")
    
    # 4. 将合成音频与无声视频合成
    video_ext = Path(task.original_video_url).suffix or '.mp4'
    output_filename = f"{task.user_id}_{task.id}_composite{video_ext}"
    output_video_path = os.path.join(USER_DUBBINGS_DIR, output_filename)
    
    if not merge_audio_to_video(mute_video_path, merged_audio_path, output_video_path):
        raise Exception("合成最终视频失败")
    
    return f"/user_dubbings/{output_filename}"


async def process_video_dubbing_task(task: UserDubbing, work_dir: str) -> str:
    """
    处理视频配音任务
    
    流程：
    1. 下载原视频（去人声版本）
    2. 获取用户录制的视频
    3. 上下拼接成竖版720p视频
    4. 返回最终视频路径
    """
    # 1. 获取或下载原视频（使用去人声缓存或下载原视频）
    url_hash = get_url_hash(task.original_video_url)
    video_ext = Path(task.original_video_url).suffix or '.mp4'
    
    # 尝试使用去人声的缓存
    cached_mute_path = os.path.join(MUTE_VIDEO_CACHE_DIR, f"{url_hash}_mute{video_ext}")
    
    if os.path.exists(cached_mute_path):
        original_video_path = cached_mute_path
        logger.info(f"使用缓存的无声视频: {cached_mute_path}")
    else:
        # 下载原视频
        original_video_path = os.path.join(work_dir, f"original{video_ext}")
        if not await download_video(task.original_video_url, original_video_path):
            raise Exception("下载原视频失败")
    
    # 2. 获取用户录制的视频路径
    user_video_path_attr = getattr(task, 'user_video_path', None)
    if not user_video_path_attr:
        raise Exception("视频配音模式需要用户视频")
    
    user_video_path = os.path.join(os.path.dirname(__file__), user_video_path_attr.lstrip('/'))
    if not os.path.exists(user_video_path):
        raise Exception(f"用户视频文件不存在: {user_video_path}")
    
    # 3. 上下拼接成竖版视频
    output_filename = f"{task.user_id}_{task.id}_video_dubbing.mp4"
    output_video_path = os.path.join(USER_DUBBINGS_DIR, output_filename)
    
    if not stack_videos_vertical(original_video_path, user_video_path, output_video_path):
        raise Exception("视频拼接失败")
    
    return f"/user_dubbings/{output_filename}"


async def composite_video_worker():
    """
    视频合成 Worker
    定期检查待处理的任务并执行
    """
    logger.info("视频合成 Worker 已启动")
    
    # 启动时清理失败的任务
    db = get_db_session()
    try:
        deleted_count = cleanup_failed_user_dubbings(db)
        if deleted_count > 0:
            logger.info(f"已清理 {deleted_count} 个失败的视频合成任务")
    finally:
        db.close()
    
    while True:
        try:
            # 检查待处理的任务
            db = get_db_session()
            try:
                pending_tasks = get_pending_user_dubbings(db)
                
                for task in pending_tasks:
                    logger.info(f"发现待处理的合成任务: {task.id}")
                    await process_composite_video_task(task)
                    
            finally:
                db.close()
            
            # 等待一段时间再检查
            await asyncio.sleep(COMPOSITE_VIDEO_CHECK_INTERVAL)
            
        except asyncio.CancelledError:
            logger.info("视频合成 Worker 被取消")
            break
        except Exception as e:
            logger.error(f"视频合成 Worker 执行出错: {e}")
            await asyncio.sleep(10)


# Worker 任务引用，用于停止
_worker_task: Optional[asyncio.Task] = None
_vocal_removal_worker_task: Optional[asyncio.Task] = None
_composite_video_worker_task: Optional[asyncio.Task] = None


def start_worker():
    """启动 Worker"""
    global _worker_task, _vocal_removal_worker_task, _composite_video_worker_task
    
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(recommendation_worker())
        logger.info("推荐片段 Worker 任务已创建")
    
    if _vocal_removal_worker_task is None or _vocal_removal_worker_task.done():
        _vocal_removal_worker_task = asyncio.create_task(vocal_removal_worker())
        logger.info("人声去除 Worker 任务已创建")
    
    if _composite_video_worker_task is None or _composite_video_worker_task.done():
        _composite_video_worker_task = asyncio.create_task(composite_video_worker())
        logger.info("视频合成 Worker 任务已创建")


def stop_worker():
    """停止 Worker"""
    global _worker_task, _vocal_removal_worker_task, _composite_video_worker_task
    
    if _worker_task and not _worker_task.done():
        _worker_task.cancel()
        logger.info("推荐片段 Worker 任务已取消")
    
    if _vocal_removal_worker_task and not _vocal_removal_worker_task.done():
        _vocal_removal_worker_task.cancel()
        logger.info("人声去除 Worker 任务已取消")
    
    if _composite_video_worker_task and not _composite_video_worker_task.done():
        _composite_video_worker_task.cancel()
        logger.info("视频合成 Worker 任务已取消")