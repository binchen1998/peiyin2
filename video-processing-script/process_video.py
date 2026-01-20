#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
视频配音片段处理脚本
用于从动画视频中提取字幕，选择适合儿童配音的片段，并生成对应的视频片段和JSON数据。
"""

import os
import sys
import re
import json
import shutil
import subprocess
import argparse
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
from openai import OpenAI

# 配置
WHISPER_EXE = r"D:\Faster-Whisper-XXL_r192.3.3_windows\Faster-Whisper-XXL\faster-whisper-xxl.exe"
FFMPEG_EXE = "ffmpeg"  # 假设 ffmpeg 在 PATH 中，如果不在请修改为完整路径

# 从 .env 文件读取 API Key
OPENAI_API_KEY = None
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
if os.path.exists(env_path):
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line.startswith('OPENAI_API_KEY='):
                OPENAI_API_KEY = line.split('=', 1)[1].strip().strip('"').strip("'")
                break

# 也尝试从环境变量读取
if not OPENAI_API_KEY:
    OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')


def file_exists_and_not_empty(filepath: str) -> bool:
    """
    检查文件是否存在且内容不为空
    用于跳过已生成的文件，支持断点续传
    """
    if not os.path.exists(filepath):
        return False
    return os.path.getsize(filepath) > 0


def sanitize_filename(filename: str) -> str:
    """
    清理文件名，去除首尾空格和多余空格
    例如: "CE001 Muddy Puddles  " -> "CE001 Muddy Puddles"
    """
    # 去除首尾空格
    filename = filename.strip()
    # 将多个连续空格替换为单个空格
    filename = re.sub(r'\s+', ' ', filename)
    return filename


def get_safe_output_dirname(video_name: str) -> str:
    """
    获取安全的输出目录名
    清理文件名中的特殊字符和多余空格
    """
    # 先清理空格
    name = sanitize_filename(video_name)
    # 替换 Windows 不允许的目录名字符
    invalid_chars = r'<>:"/\|?*'
    for char in invalid_chars:
        name = name.replace(char, '_')
    return name


class SRTSubtitle:
    """SRT 字幕条目类"""
    def __init__(self, index: int, start_time: str, end_time: str, text: str):
        self.index = index
        self.start_time = start_time
        self.end_time = end_time
        self.text = text
    
    def get_start_seconds(self) -> float:
        """将开始时间转换为秒数"""
        return self._time_to_seconds(self.start_time)
    
    def get_end_seconds(self) -> float:
        """将结束时间转换为秒数"""
        return self._time_to_seconds(self.end_time)
    
    def get_duration(self) -> float:
        """获取持续时间（秒）"""
        return round(self.get_end_seconds() - self.get_start_seconds(), 2)
    
    @staticmethod
    def _time_to_seconds(time_str: str) -> float:
        """将 SRT 时间格式转换为秒数"""
        # 格式: HH:MM:SS,mmm
        time_str = time_str.replace(',', '.')
        parts = time_str.split(':')
        hours = int(parts[0])
        minutes = int(parts[1])
        seconds = float(parts[2])
        return hours * 3600 + minutes * 60 + seconds


def parse_srt_file(srt_path: str) -> List[SRTSubtitle]:
    """解析 SRT 字幕文件"""
    subtitles = []
    
    with open(srt_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 按空行分割字幕块
    blocks = re.split(r'\n\s*\n', content.strip())
    
    for block in blocks:
        lines = block.strip().split('\n')
        if len(lines) >= 3:
            try:
                index = int(lines[0].strip())
                time_line = lines[1].strip()
                # 解析时间行：00:00:01,000 --> 00:00:04,000
                time_match = re.match(r'(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})', time_line)
                if time_match:
                    start_time = time_match.group(1)
                    end_time = time_match.group(2)
                    text = '\n'.join(lines[2:]).strip()
                    subtitles.append(SRTSubtitle(index, start_time, end_time, text))
            except (ValueError, IndexError):
                continue
    
    return subtitles


def extract_subtitles(video_path: str, output_dir: str) -> str:
    """使用 faster-whisper-xxl 提取字幕，或使用已存在的字幕文件"""
    print(f"正在提取字幕: {video_path}")
    
    video_name = Path(video_path).stem
    # 清理文件名中的多余空格
    video_name_cleaned = sanitize_filename(video_name)
    
    # 确保路径使用绝对路径，避免空格问题
    video_path = os.path.abspath(video_path)
    output_dir = os.path.abspath(output_dir)
    video_dir = os.path.dirname(video_path)
    
    # 首先检查视频目录或输出目录中是否已经存在 srt 文件
    possible_names = [
        f"{video_name}.srt",           # 原始文件名
        f"{video_name_cleaned}.srt",   # 清理后的文件名
    ]
    
    # 检查视频目录
    for name in possible_names:
        srt_path = os.path.join(video_dir, name)
        if os.path.exists(srt_path) and os.path.getsize(srt_path) > 0:
            print(f"发现已存在的字幕文件: {srt_path}")
            # 如果不在输出目录，复制一份到输出目录
            target_path = os.path.join(output_dir, name)
            if srt_path != target_path:
                os.makedirs(output_dir, exist_ok=True)
                shutil.copy2(srt_path, target_path)
                print(f"已复制到: {target_path}")
                return target_path
            return srt_path
    
    # 检查输出目录
    for name in possible_names:
        srt_path = os.path.join(output_dir, name)
        if os.path.exists(srt_path) and os.path.getsize(srt_path) > 0:
            print(f"发现已存在的字幕文件: {srt_path}")
            return srt_path
    
    # 没有找到现有字幕文件，运行 faster-whisper-xxl
    # 注意：使用列表形式传递参数，subprocess 会自动处理空格
    cmd = [
        WHISPER_EXE,
        video_path,
        "--output_format", "srt",
        "--output_dir", output_dir
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
        if result.returncode != 0:
            print(f"字幕提取失败: {result.stderr}")
            return None
    except Exception as e:
        print(f"运行 faster-whisper-xxl 出错: {e}")
        return None
    
    # 查找生成的 SRT 文件 - 尝试多种可能的文件名
    possible_names = [
        f"{video_name}.srt",           # 原始文件名
        f"{video_name_cleaned}.srt",   # 清理后的文件名
    ]
    
    for name in possible_names:
        srt_path = os.path.join(output_dir, name)
        if os.path.exists(srt_path):
            print(f"字幕文件已生成: {srt_path}")
            return srt_path
    
    # 尝试查找任何 SRT 文件（处理工具可能生成不同名称的情况）
    for file in os.listdir(output_dir):
        if file.lower().endswith('.srt'):
            srt_path = os.path.join(output_dir, file)
            print(f"字幕文件已生成: {srt_path}")
            return srt_path
    
    print("未找到生成的 SRT 文件")
    return None


def select_clips_with_chatgpt(srt_content: str, api_key: str, clip_count: int = 10) -> List[int]:
    """
    使用 ChatGPT 选择适合儿童配音的字幕片段
    返回选中的字幕序号列表
    """
    print(f"正在使用 ChatGPT 选择 {clip_count} 条适合配音的字幕...")
    
    client = OpenAI(api_key=api_key)
    
    prompt = f"""这是一个SRT字幕文件的内容，我在做一个儿童配音项目。
请从中选择大约{clip_count}条最适合儿童配音的字幕。

选择标准：
1. 语句清晰、发音标准
2. 内容积极向上，适合儿童
3. 长度适中（不要太长也不要太短）
4. 语气生动有趣
5. 避免复杂词汇或难以发音的内容

请只返回一个JSON数组，包含选中字幕的序号（index），格式如下：
{{"selected_indices": [1, 3, 5, 7, ...]}}

SRT字幕内容:
{srt_content}
"""
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "你是一个专业的儿童配音项目助手，帮助选择适合儿童配音练习的动画片段。只返回JSON格式的结果。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            response_format={"type": "json_object"}
        )
        
        result = json.loads(response.choices[0].message.content)
        selected_indices = result.get("selected_indices", [])
        print(f"ChatGPT 选择了 {len(selected_indices)} 条字幕: {selected_indices}")
        return selected_indices
        
    except Exception as e:
        print(f"调用 ChatGPT API 出错: {e}")
        return []


def translate_all_with_chatgpt(texts: List[str], video_title: str, api_key: str) -> Tuple[Dict[str, str], str]:
    """
    使用 ChatGPT 一次性翻译所有文本（包括字幕和视频标题）
    返回: (字幕翻译字典, 标题翻译)
    """
    print("正在翻译字幕和标题...")
    
    client = OpenAI(api_key=api_key)
    
    texts_json = json.dumps(texts, ensure_ascii=False)
    
    prompt = f"""请翻译以下内容为中文，适合儿童阅读。

1. 视频标题: {video_title}

2. 字幕内容:
{texts_json}

返回JSON格式：
{{
    "title": "视频标题的中文翻译",
    "subtitles": {{"English text": "中文翻译", ...}}
}}
"""
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "你是一个专业的翻译，专注于儿童内容的翻译。只返回JSON格式的结果。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            response_format={"type": "json_object"}
        )
        
        result = json.loads(response.choices[0].message.content)
        translations = result.get("subtitles", {})
        title_cn = result.get("title", video_title)
        print(f"翻译完成: 标题 + {len(translations)} 条字幕")
        return translations, title_cn
        
    except Exception as e:
        print(f"翻译出错: {e}")
        return {}, video_title


def extract_video_clip(video_path: str, start_time: float, end_time: float, 
                       output_path: str) -> bool:
    """使用 ffmpeg 截取视频片段"""
    duration = end_time - start_time
    
    cmd = [
        FFMPEG_EXE,
        "-y",  # 覆盖已存在的文件
        "-i", video_path,
        "-ss", str(start_time),
        "-t", str(duration),
        "-c:v", "libx264",
        "-c:a", "aac",
        "-strict", "experimental",
        output_path
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
        if result.returncode == 0:
            return True
        else:
            print(f"视频截取失败: {result.stderr}")
            return False
    except Exception as e:
        print(f"运行 ffmpeg 出错: {e}")
        return False


def extract_thumbnail(video_path: str, time_point: float, output_path: str) -> bool:
    """从视频中提取缩略图"""
    cmd = [
        FFMPEG_EXE,
        "-y",
        "-i", video_path,
        "-ss", str(time_point),
        "-vframes", "1",
        "-q:v", "2",
        output_path
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
        return result.returncode == 0
    except Exception as e:
        print(f"提取缩略图出错: {e}")
        return False


def process_single_video(video_path: str, output_dir: str, api_key: str, 
                         clip_count: int = 10) -> Optional[Dict]:
    """
    处理单个视频文件
    返回生成的 JSON 数据
    """
    video_path = os.path.abspath(video_path)
    video_name_raw = Path(video_path).stem
    # 清理文件名中的多余空格
    video_name = sanitize_filename(video_name_raw)
    
    print(f"\n{'='*60}")
    print(f"开始处理视频: {video_name}")
    print(f"{'='*60}")
    
    # 创建输出目录
    os.makedirs(output_dir, exist_ok=True)
    
    # 步骤1: 提取字幕
    srt_path = extract_subtitles(video_path, output_dir)
    if not srt_path:
        print("字幕提取失败，跳过此视频")
        return None
    
    # 解析 SRT 文件
    subtitles = parse_srt_file(srt_path)
    print(f"解析到 {len(subtitles)} 条字幕")
    
    if len(subtitles) == 0:
        print("没有字幕内容，跳过此视频")
        return None
    
    # 步骤2: 使用 ChatGPT 选择字幕
    with open(srt_path, 'r', encoding='utf-8') as f:
        srt_content = f.read()
    
    selected_indices = select_clips_with_chatgpt(srt_content, api_key, clip_count)
    
    if not selected_indices:
        print("ChatGPT 没有返回有效的选择，使用前10条字幕")
        selected_indices = [s.index for s in subtitles[:min(clip_count, len(subtitles))]]
    
    # 步骤3: 根据序号提取字幕信息
    subtitle_map = {s.index: s for s in subtitles}
    selected_subtitles = []
    for idx in selected_indices:
        if idx in subtitle_map:
            selected_subtitles.append(subtitle_map[idx])
    
    print(f"成功匹配 {len(selected_subtitles)} 条字幕")
    
    if not selected_subtitles:
        print("没有匹配到字幕，跳过此视频")
        return None
    
    # 一次性翻译字幕和标题
    texts_to_translate = [s.text for s in selected_subtitles]
    translations, title_cn = translate_all_with_chatgpt(texts_to_translate, video_name, api_key)
    
    # 步骤4 & 5: 截取视频片段并生成 JSON
    clips = []
    clips_dir = os.path.join(output_dir, "clips")
    thumbnails_dir = os.path.join(output_dir, "thumbnails")
    os.makedirs(clips_dir, exist_ok=True)
    os.makedirs(thumbnails_dir, exist_ok=True)
    
    # 提取主缩略图
    main_thumbnail = "main.jpg"
    main_thumbnail_path = os.path.join(thumbnails_dir, main_thumbnail)
    if selected_subtitles:
        extract_thumbnail(video_path, selected_subtitles[0].get_start_seconds(), 
                         main_thumbnail_path)
    
    # 准备所有片段的任务数据
    PADDING_SECONDS = 1.0
    tasks = []
    for i, subtitle in enumerate(selected_subtitles, 1):
        clip_filename = f"clip_{i}.mp4"
        thumbnail_filename = f"thumb_{i}.jpg"
        clip_path = os.path.join(clips_dir, clip_filename)
        thumbnail_path = os.path.join(thumbnails_dir, thumbnail_filename)
        clip_start = max(0, subtitle.get_start_seconds() - PADDING_SECONDS)
        clip_end = subtitle.get_end_seconds() + PADDING_SECONDS
        
        tasks.append({
            "index": i,
            "subtitle": subtitle,
            "clip_filename": clip_filename,
            "thumbnail_filename": thumbnail_filename,
            "clip_path": clip_path,
            "thumbnail_path": thumbnail_path,
            "clip_start": clip_start,
            "clip_end": clip_end
        })
    
    def process_clip(task):
        """处理单个片段的函数"""
        i = task["index"]
        subtitle = task["subtitle"]
        clip_path = task["clip_path"]
        thumbnail_path = task["thumbnail_path"]
        clip_start = task["clip_start"]
        clip_end = task["clip_end"]
        
        clip_success = True
        
        # 截取视频片段
        if file_exists_and_not_empty(clip_path):
            pass  # 已存在，跳过
        else:
            clip_success = extract_video_clip(video_path, clip_start, clip_end, clip_path)
        
        # 提取缩略图
        if not file_exists_and_not_empty(thumbnail_path):
            extract_thumbnail(video_path, subtitle.get_start_seconds() + 0.5, thumbnail_path)
        
        return {
            "task": task,
            "success": clip_success
        }
    
    # 并行处理所有片段
    print(f"正在并行处理 {len(tasks)} 个片段...")
    results = {}
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(process_clip, task): task["index"] for task in tasks}
        for future in as_completed(futures):
            idx = futures[future]
            try:
                result = future.result()
                results[idx] = result
                status = "完成" if result["success"] else "失败"
                print(f"  片段 {idx}/{len(tasks)} {status}")
            except Exception as e:
                print(f"  片段 {idx}/{len(tasks)} 出错: {e}")
                results[idx] = {"task": tasks[idx-1], "success": False}
    
    # 按顺序生成 clips 数据
    for task in tasks:
        i = task["index"]
        result = results.get(i)
        if not result or not result["success"]:
            continue
        
        subtitle = task["subtitle"]
        translation = translations.get(subtitle.text, subtitle.text)
        actual_duration = round(task["clip_end"] - task["clip_start"], 2)
        
        clip_data = {
            "video_url": f"clips/{task['clip_filename']}",
            "original_text": subtitle.text,
            "translation_cn": translation,
            "thumbnail": f"thumbnails/{task['thumbnail_filename']}",
            "duration": actual_duration
        }
        clips.append(clip_data)
    
    # 生成最终 JSON
    result = {
        "title": video_name,
        "title_cn": title_cn,
        "thumbnail": f"thumbnails/{main_thumbnail}",
        "source_video": os.path.basename(video_path),
        "generated_at": datetime.now().isoformat(),
        "clips": clips
    }
    
    # 保存 JSON 文件
    json_path = os.path.join(output_dir, f"{video_name}.json")
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    print(f"\n完成! JSON 文件已保存: {json_path}")
    print(f"共生成 {len(clips)} 个视频片段")
    
    return result


def generate_all_json(input_dir: str) -> List[Dict]:
    """
    遍历目录下所有子目录，生成 all.json
    返回所有视频的元数据列表
    """
    input_dir = os.path.abspath(input_dir)
    all_videos = []
    
    # 遍历目录下的所有子目录
    for item in os.listdir(input_dir):
        item_path = os.path.join(input_dir, item)
        
        # 跳过文件，只处理目录
        if not os.path.isdir(item_path):
            continue
        
        # 查找子目录中的 JSON 文件（排除 summary.json 和 all.json）
        json_files = [f for f in os.listdir(item_path) 
                      if f.lower().endswith('.json') 
                      and f.lower() not in ('summary.json', 'all.json')]
        
        if json_files:
            # 使用第一个找到的 JSON 文件
            json_path = os.path.join(item_path, json_files[0])
            try:
                with open(json_path, 'r', encoding='utf-8') as f:
                    video_data = json.load(f)
                
                # 使用目录名作为 name（确保一致性）
                all_videos.append({
                    "id": len(all_videos),
                    "name": item  # 使用目录名
                })
            except Exception as e:
                print(f"读取 JSON 文件失败: {json_path}, 错误: {e}")
    
    # 按名称排序
    all_videos.sort(key=lambda x: x["name"])
    
    # 重新分配 id
    for i, video in enumerate(all_videos):
        video["id"] = i
    
    # 保存 all.json
    all_json_path = os.path.join(input_dir, "all.json")
    with open(all_json_path, 'w', encoding='utf-8') as f:
        json.dump(all_videos, f, ensure_ascii=False, indent=2)
    
    print(f"已生成 all.json，包含 {len(all_videos)} 个视频目录")
    
    return all_videos


def process_directory(input_dir: str, api_key: str, clip_count: int = 10, max_retries: int = 5):
    """处理目录下的所有 MP4 文件，最多重试 max_retries 次确保所有文件都处理完成"""
    input_dir = os.path.abspath(input_dir)
    
    # 检查目录是否存在
    if not os.path.exists(input_dir):
        print(f"错误: 目录不存在: {input_dir}")
        sys.exit(1)
    
    if not os.path.isdir(input_dir):
        print(f"错误: 路径不是目录: {input_dir}")
        sys.exit(1)
    
    # 查找所有 MP4 文件
    mp4_files = []
    for file in os.listdir(input_dir):
        if file.lower().endswith('.mp4'):
            mp4_files.append(os.path.join(input_dir, file))
    
    if not mp4_files:
        print(f"错误: 目录 {input_dir} 中没有找到 MP4 文件")
        sys.exit(1)
    
    print(f"找到 {len(mp4_files)} 个 MP4 文件")
    
    # 构建 MP4 文件到输出目录和 JSON 路径的映射
    video_info = []
    for video_path in mp4_files:
        video_name_raw = Path(video_path).stem
        video_name = get_safe_output_dirname(video_name_raw)
        output_dir = os.path.join(input_dir, video_name)
        json_path = os.path.join(output_dir, f"{sanitize_filename(video_name_raw)}.json")
        video_info.append({
            "video_path": video_path,
            "video_name": video_name,
            "output_dir": output_dir,
            "json_path": json_path
        })
    
    # 循环处理，最多 max_retries 次
    results = {}  # 使用字典存储结果，key 为 video_name
    
    for attempt in range(1, max_retries + 1):
        # 检查哪些文件还没有生成 JSON
        pending_videos = []
        for info in video_info:
            if not file_exists_and_not_empty(info["json_path"]):
                pending_videos.append(info)
        
        if not pending_videos:
            print(f"\n所有 {len(mp4_files)} 个视频都已成功生成 JSON 文件！")
            break
        
        print(f"\n{'#'*60}")
        print(f"第 {attempt}/{max_retries} 轮处理")
        print(f"待处理: {len(pending_videos)} 个视频，已完成: {len(mp4_files) - len(pending_videos)} 个")
        print(f"{'#'*60}")
        
        # 处理未完成的视频
        for info in pending_videos:
            result = process_single_video(
                info["video_path"], 
                info["output_dir"], 
                api_key, 
                clip_count
            )
            if result:
                results[info["video_name"]] = result
            
            # 如果 JSON 文件已成功生成，删除原始 MP4 文件
            if file_exists_and_not_empty(info["json_path"]):
                try:
                    os.remove(info["video_path"])
                    print(f"已删除处理完成的 MP4 文件: {info['video_path']}")
                except Exception as e:
                    print(f"删除 MP4 文件失败: {info['video_path']}, 错误: {e}")
        
        # 检查本轮处理后的结果
        completed_count = sum(1 for info in video_info if file_exists_and_not_empty(info["json_path"]))
        print(f"\n第 {attempt} 轮处理完成，已完成: {completed_count}/{len(mp4_files)}")
        
        if completed_count == len(mp4_files):
            print("所有视频处理完成！")
            break
        elif attempt < max_retries:
            print(f"还有 {len(mp4_files) - completed_count} 个视频未完成，将在下一轮重试...")
    else:
        # 循环正常结束（达到最大重试次数）
        failed_count = sum(1 for info in video_info if not file_exists_and_not_empty(info["json_path"]))
        if failed_count > 0:
            print(f"\n警告: 达到最大重试次数 ({max_retries})，仍有 {failed_count} 个视频未完成处理")
    
    # 收集所有已完成的结果（包括之前已存在的）
    final_results = []
    for info in video_info:
        if file_exists_and_not_empty(info["json_path"]):
            try:
                with open(info["json_path"], 'r', encoding='utf-8') as f:
                    result = json.load(f)
                final_results.append(result)
            except Exception as e:
                print(f"读取 JSON 文件失败: {info['json_path']}, 错误: {e}")
    
    # 生成汇总 JSON (summary.json)
    summary = {
        "total_videos": len(final_results),
        "generated_at": datetime.now().isoformat(),
        "videos": [
            {
                "title": r["title"],
                "title_cn": r.get("title_cn", r["title"]),
                "clip_count": len(r.get("clips", [])),
                "folder": r["title"]
            }
            for r in final_results
        ]
    }
    
    summary_path = os.path.join(input_dir, "summary.json")
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    
    # 生成目录元数据 JSON (all.json) - 遍历所有子目录生成
    all_videos = generate_all_json(input_dir)
    all_json_path = os.path.join(input_dir, "all.json")
    
    # 复制第一集的 main.jpg 到 all.json 同目录
    if all_videos and len(all_videos) > 0:
        first_video_name = all_videos[0]["name"]
        first_video_dir = os.path.join(input_dir, first_video_name)
        first_main_jpg = os.path.join(first_video_dir, "thumbnails", "main.jpg")
        target_main_jpg = os.path.join(input_dir, "main.jpg")
        
        if file_exists_and_not_empty(first_main_jpg):
            try:
                shutil.copy2(first_main_jpg, target_main_jpg)
                print(f"已复制第一集的 main.jpg 到: {target_main_jpg}")
            except Exception as e:
                print(f"复制 main.jpg 失败: {e}")
        else:
            print(f"警告: 第一集的 main.jpg 不存在: {first_main_jpg}")
    
    print(f"\n{'='*60}")
    print(f"全部处理完成!")
    print(f"成功处理: {len(final_results)}/{len(mp4_files)} 个视频")
    print(f"汇总文件: {summary_path}")
    print(f"目录元数据: {all_json_path}")
    print(f"{'='*60}")


def main():
    parser = argparse.ArgumentParser(
        description="视频配音片段处理工具 - 从动画视频中提取适合儿童配音的片段",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  处理单个视频:
    python process_video.py video.mp4 --api-key YOUR_API_KEY
    
  处理目录下所有视频:
    python process_video.py /path/to/videos --api-key YOUR_API_KEY
    
  指定片段数量:
    python process_video.py video.mp4 --api-key YOUR_API_KEY --clips 15

配置文件:
  需要在脚本所在目录创建 .env 文件，内容如下:
  OPENAI_API_KEY=your_api_key_here
        """
    )
    
    parser.add_argument(
        "input",
        help="输入的视频文件(.mp4)或包含视频文件的目录"
    )
    parser.add_argument(
        "--api-key",
        help="OpenAI API Key (默认从 .env 文件读取 OPENAI_API_KEY)",
        default=OPENAI_API_KEY
    )
    parser.add_argument(
        "--clips",
        type=int,
        default=10,
        help="要选择的配音片段数量 (默认: 10)"
    )
    parser.add_argument(
        "--output",
        help="输出目录 (默认: 与视频文件同目录，以视频名命名)",
        default=None
    )
    
    args = parser.parse_args()
    
    # 检查 API Key (此时 .env 已经在脚本开头检查过，这里是额外检查)
    if not args.api_key:
        print("错误: 请提供 OpenAI API Key")
        print("在 .env 文件中设置 OPENAI_API_KEY 或使用 --api-key 参数")
        sys.exit(1)
    
    # 检查 faster-whisper-xxl 是否存在
    if not os.path.exists(WHISPER_EXE):
        print(f"警告: 找不到 faster-whisper-xxl: {WHISPER_EXE}")
        print("请确保路径正确或修改脚本中的 WHISPER_EXE 变量")
    
    # 检查输入
    input_path = os.path.abspath(args.input)
    
    if os.path.isfile(input_path):
        # 处理单个文件
        if not input_path.lower().endswith('.mp4'):
            print("错误: 输入文件必须是 .mp4 格式")
            sys.exit(1)
        
        video_name_raw = Path(input_path).stem
        # 使用清理后的文件名创建输出目录
        video_name = get_safe_output_dirname(video_name_raw)
        output_dir = args.output or os.path.join(os.path.dirname(input_path), video_name)
        
        process_single_video(input_path, output_dir, args.api_key, args.clips)
        
    elif os.path.isdir(input_path):
        # 处理目录
        process_directory(input_path, args.api_key, args.clips)
        
    else:
        print(f"错误: 找不到输入路径: {input_path}")
        sys.exit(1)


if __name__ == "__main__":
    main()
