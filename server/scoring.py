"""
Vosk 语音评分模块
通过远程 Vosk 服务进行语音评分
"""

import os
import logging
import httpx
from typing import List, Dict, Any
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Vosk 远程服务地址
VOSK_SERVICE_URL = os.environ.get("VOSK_SERVICE_URL", "https://vosk.coding61.com/score")

# 请求超时时间（秒）
VOSK_TIMEOUT = int(os.environ.get("VOSK_TIMEOUT", 60))


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
    通过远程 Vosk 服务进行语音评分的类
    """
    
    def __init__(self, model_path: str = None):
        """
        初始化评分器
        
        Args:
            model_path: 保留参数，兼容旧接口（远程服务不需要）
        """
        self.service_url = VOSK_SERVICE_URL
        self.timeout = VOSK_TIMEOUT
        logger.info(f"Vosk 评分器初始化，远程服务地址: {self.service_url}")
    
    def score(self, audio_path: str, expected_text: str) -> Dict[str, Any]:
        """
        对音频进行评分（调用远程 Vosk 服务）
        
        Args:
            audio_path: 音频文件路径
            expected_text: 期望的文本
            
        Returns:
            评分结果字典
        """
        logger.info(f"开始评分: audio={audio_path}, text={expected_text}")
        
        try:
            # 读取音频文件
            with open(audio_path, 'rb') as audio_file:
                files = {
                    'audio': (os.path.basename(audio_path), audio_file, 'audio/mpeg')
                }
                data = {
                    'text': expected_text
                }
                
                # 调用远程服务
                with httpx.Client(timeout=self.timeout) as client:
                    response = client.post(
                        self.service_url,
                        files=files,
                        data=data
                    )
                    
                    if response.status_code == 200:
                        result = response.json()
                        logger.info(f"评分成功: overallScore={result.get('overallScore')}")
                        
                        # 返回结果，保持与远程服务返回格式一致
                        return {
                            "overallScore": result.get("overallScore", 0),
                            "phonemeScores": [],  # 兼容旧接口
                            "wordScores": result.get("wordScores", []),
                            "recognizedText": result.get("recognizedText", ""),
                            "feedback": result.get("feedback", "")
                        }
                    else:
                        logger.error(f"Vosk 服务返回错误: {response.status_code} - {response.text}")
                        return self._mock_score(expected_text, f"服务错误: {response.status_code}")
                        
        except httpx.TimeoutException:
            logger.error(f"Vosk 服务超时 ({self.timeout}s)")
            return self._mock_score(expected_text, "服务超时，请稍后重试")
            
        except httpx.RequestError as e:
            logger.error(f"Vosk 服务请求失败: {e}")
            return self._mock_score(expected_text, "服务暂时不可用，请稍后重试")
            
        except Exception as e:
            logger.error(f"评分失败: {e}")
            return self._mock_score(expected_text, f"评分失败: {str(e)}")
    
    async def score_async(self, audio_path: str, expected_text: str) -> Dict[str, Any]:
        """
        异步评分（调用远程 Vosk 服务）
        
        Args:
            audio_path: 音频文件路径
            expected_text: 期望的文本
            
        Returns:
            评分结果字典
        """
        logger.info(f"开始异步评分: audio={audio_path}, text={expected_text}")
        
        try:
            with open(audio_path, 'rb') as audio_file:
                audio_content = audio_file.read()
            
            files = {
                'audio': (os.path.basename(audio_path), audio_content, 'audio/mpeg')
            }
            data = {
                'text': expected_text
            }
            
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    self.service_url,
                    files=files,
                    data=data
                )
                
                if response.status_code == 200:
                    result = response.json()
                    logger.info(f"评分成功: overallScore={result.get('overallScore')}")
                    
                    return {
                        "overallScore": result.get("overallScore", 0),
                        "phonemeScores": [],
                        "wordScores": result.get("wordScores", []),
                        "recognizedText": result.get("recognizedText", ""),
                        "feedback": result.get("feedback", "")
                    }
                else:
                    logger.error(f"Vosk 服务返回错误: {response.status_code} - {response.text}")
                    return self._mock_score(expected_text, f"服务错误: {response.status_code}")
                    
        except httpx.TimeoutException:
            logger.error(f"Vosk 服务超时 ({self.timeout}s)")
            return self._mock_score(expected_text, "服务超时，请稍后重试")
            
        except httpx.RequestError as e:
            logger.error(f"Vosk 服务请求失败: {e}")
            return self._mock_score(expected_text, "服务暂时不可用，请稍后重试")
            
        except Exception as e:
            logger.error(f"评分失败: {e}")
            return self._mock_score(expected_text, f"评分失败: {str(e)}")
    
    def _mock_score(self, expected_text: str, error_message: str) -> Dict[str, Any]:
        """
        生成模拟评分结果（当远程服务不可用时）
        
        Args:
            expected_text: 期望的文本
            error_message: 错误信息
            
        Returns:
            模拟的评分结果
        """
        words = expected_text.split()
        word_scores = []
        
        for word in words:
            clean_word = ''.join(c for c in word if c.isalnum())
            phoneme_scores = []
            for k, char in enumerate(clean_word):
                if char.isalpha():
                    phoneme_scores.append({
                        "phoneme": char,
                        "score": 0,
                        "startTime": k * 0.1,
                        "endTime": (k + 1) * 0.1
                    })
            
            word_scores.append({
                "word": word,
                "score": 0,
                "phonemes": phoneme_scores
            })
        
        return {
            "overallScore": 0,
            "phonemeScores": [],
            "wordScores": word_scores,
            "recognizedText": "",
            "feedback": error_message
        }


# 导出
__all__ = ['VoskScorer', 'ScoringResult', 'WordScore', 'PhonemeScore']
