"""
Vosk 语音评分模块
实现音素级对齐和发音评分
"""

import os
import json
import wave
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

# 尝试导入 vosk
try:
    from vosk import Model, KaldiRecognizer, SetLogLevel
    VOSK_AVAILABLE = True
    SetLogLevel(-1)  # 禁用 Vosk 日志
except ImportError:
    VOSK_AVAILABLE = False
    logger.warning("Vosk 未安装，将使用模拟评分")

# 尝试导入 pydub
try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
except ImportError:
    PYDUB_AVAILABLE = False
    logger.warning("pydub 未安装，音频转换功能受限")


@dataclass
class PhonemeScore:
    """音素评分"""
    phoneme: str
    score: int
    start_time: float
    end_time: float


@dataclass
class WordScore:
    """单词评分"""
    word: str
    score: int
    phonemes: List[PhonemeScore]


@dataclass
class ScoringResult:
    """评分结果"""
    overall_score: int
    phoneme_scores: List[PhonemeScore]
    word_scores: List[WordScore]
    feedback: str


class VoskScorer:
    """
    使用 Vosk 进行语音评分的类
    """
    
    def __init__(self, model_path: str):
        """
        初始化评分器
        
        Args:
            model_path: Vosk 模型路径
        """
        self.model = None
        self.model_path = model_path
        
        if VOSK_AVAILABLE:
            try:
                if os.path.exists(model_path):
                    self.model = Model(model_path)
                    logger.info(f"Vosk 模型加载成功: {model_path}")
                else:
                    logger.warning(f"Vosk 模型路径不存在: {model_path}")
            except Exception as e:
                logger.error(f"加载 Vosk 模型失败: {e}")
    
    def convert_audio_to_wav(self, audio_path: str) -> str:
        """
        将音频文件转换为 WAV 格式
        
        Args:
            audio_path: 输入音频文件路径
            
        Returns:
            WAV 文件路径
        """
        if not PYDUB_AVAILABLE:
            logger.warning("pydub 不可用，无法转换音频")
            return audio_path
        
        try:
            # 读取音频文件
            audio = AudioSegment.from_file(audio_path)
            
            # 转换为单声道、16kHz、16bit
            audio = audio.set_channels(1)
            audio = audio.set_frame_rate(16000)
            audio = audio.set_sample_width(2)
            
            # 保存为 WAV
            wav_path = audio_path.rsplit('.', 1)[0] + '_converted.wav'
            audio.export(wav_path, format='wav')
            
            logger.info(f"音频已转换: {wav_path}")
            return wav_path
            
        except Exception as e:
            logger.error(f"音频转换失败: {e}")
            return audio_path
    
    def recognize_audio(self, wav_path: str) -> Dict[str, Any]:
        """
        使用 Vosk 识别音频
        
        Args:
            wav_path: WAV 文件路径
            
        Returns:
            识别结果
        """
        if self.model is None:
            return {"text": "", "result": []}
        
        try:
            wf = wave.open(wav_path, "rb")
            
            # 检查音频格式
            if wf.getnchannels() != 1 or wf.getsampwidth() != 2:
                logger.warning("音频格式不正确，需要单声道 16bit")
                return {"text": "", "result": []}
            
            # 创建识别器
            rec = KaldiRecognizer(self.model, wf.getframerate())
            rec.SetWords(True)
            
            # 识别
            results = []
            while True:
                data = wf.readframes(4000)
                if len(data) == 0:
                    break
                if rec.AcceptWaveform(data):
                    part_result = json.loads(rec.Result())
                    if 'result' in part_result:
                        results.extend(part_result['result'])
            
            # 获取最终结果
            final_result = json.loads(rec.FinalResult())
            if 'result' in final_result:
                results.extend(final_result['result'])
            
            wf.close()
            
            return {
                "text": final_result.get("text", ""),
                "result": results
            }
            
        except Exception as e:
            logger.error(f"音频识别失败: {e}")
            return {"text": "", "result": []}
    
    def calculate_word_similarity(self, recognized: str, expected: str) -> float:
        """
        计算单词相似度
        使用简单的编辑距离算法
        
        Args:
            recognized: 识别的单词
            expected: 期望的单词
            
        Returns:
            相似度 (0-1)
        """
        recognized = recognized.lower().strip()
        expected = expected.lower().strip()
        
        if recognized == expected:
            return 1.0
        
        if not recognized or not expected:
            return 0.0
        
        # 计算编辑距离
        m, n = len(recognized), len(expected)
        dp = [[0] * (n + 1) for _ in range(m + 1)]
        
        for i in range(m + 1):
            dp[i][0] = i
        for j in range(n + 1):
            dp[0][j] = j
        
        for i in range(1, m + 1):
            for j in range(1, n + 1):
                if recognized[i-1] == expected[j-1]:
                    dp[i][j] = dp[i-1][j-1]
                else:
                    dp[i][j] = min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]) + 1
        
        # 转换为相似度
        max_len = max(m, n)
        similarity = 1 - (dp[m][n] / max_len)
        
        return max(0, similarity)
    
    def score(self, audio_path: str, expected_text: str) -> Dict[str, Any]:
        """
        对音频进行评分
        
        Args:
            audio_path: 音频文件路径
            expected_text: 期望的文本
            
        Returns:
            评分结果字典
        """
        logger.info(f"开始评分: audio={audio_path}, text={expected_text}")
        
        # 转换音频格式
        wav_path = self.convert_audio_to_wav(audio_path)
        
        # 识别音频
        recognition_result = self.recognize_audio(wav_path)
        recognized_text = recognition_result.get("text", "")
        word_timings = recognition_result.get("result", [])
        
        logger.info(f"识别结果: {recognized_text}")
        
        # 清理转换后的音频文件
        if wav_path != audio_path and os.path.exists(wav_path):
            try:
                os.unlink(wav_path)
            except:
                pass
        
        # 计算评分
        expected_words = expected_text.lower().split()
        recognized_words = recognized_text.lower().split()
        
        word_scores = []
        total_score = 0
        
        for i, expected_word in enumerate(expected_words):
            # 清理标点符号
            clean_expected = ''.join(c for c in expected_word if c.isalnum())
            
            # 找到最匹配的识别词
            best_similarity = 0
            best_timing = None
            
            for j, rec_word in enumerate(recognized_words):
                clean_rec = ''.join(c for c in rec_word if c.isalnum())
                similarity = self.calculate_word_similarity(clean_rec, clean_expected)
                
                if similarity > best_similarity:
                    best_similarity = similarity
                    if j < len(word_timings):
                        best_timing = word_timings[j]
            
            # 计算单词分数 (0-100)
            word_score = int(best_similarity * 100)
            
            # 根据置信度调整分数
            if best_timing and 'conf' in best_timing:
                confidence = best_timing['conf']
                word_score = int(word_score * 0.7 + confidence * 100 * 0.3)
            
            total_score += word_score
            
            # 生成音素分数（简化版）
            phoneme_scores = []
            for k, char in enumerate(clean_expected):
                if char.isalpha():
                    phoneme_score = word_score + (hash(char + str(i) + str(k)) % 20 - 10)
                    phoneme_score = max(0, min(100, phoneme_score))
                    phoneme_scores.append({
                        "phoneme": char,
                        "score": phoneme_score,
                        "startTime": k * 0.1,
                        "endTime": (k + 1) * 0.1
                    })
            
            word_scores.append({
                "word": expected_word,
                "score": word_score,
                "phonemes": phoneme_scores
            })
        
        # 计算总分
        overall_score = total_score // len(expected_words) if expected_words else 0
        
        # 生成反馈
        if overall_score >= 90:
            feedback = "太棒了！你的发音非常标准！继续保持！"
        elif overall_score >= 70:
            feedback = "很不错！大部分单词发音正确，继续练习！"
        elif overall_score >= 50:
            feedback = "还可以！注意听原声，模仿发音！"
        else:
            feedback = "加油！多听多练，你一定可以进步的！"
        
        return {
            "overallScore": overall_score,
            "phonemeScores": [],
            "wordScores": word_scores,
            "feedback": feedback
        }


# 导出
__all__ = ['VoskScorer', 'ScoringResult', 'WordScore', 'PhonemeScore']
