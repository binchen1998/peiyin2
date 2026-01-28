import { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Pressable, Dimensions, ActivityIndicator, Platform, Modal, ScrollView, PanResponder, GestureResponderEvent, Alert, Linking } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Audio } from 'expo-av';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VideoPlayer } from '@/components/video-player';
import { Colors, getScoreColor, getScoreFeedback } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { fetchClipByPath } from '@/data/mock-data';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ScoringResult, DubbingClip, WordScore } from '@/types';
import { API_BASE_URL, API_ENDPOINTS, VOSK_SERVICE_URL, getStreamingVideoUrl, getVocalRemovedVideoUrl } from '@/config/api';
import { getUserId } from '@/hooks/use-user-profile';

const { width, height } = Dimensions.get('window');

type RecordingStatus = 'idle' | 'recording' | 'recorded' | 'uploading' | 'scored';

// 配音模式：评分模式 vs 录制模式 vs 视频配音模式
type DubbingMode = 'score' | 'record' | 'video';

// 合成状态
type CompositeStatus = 'idle' | 'preparing' | 'recording' | 'recorded' | 'uploading' | 'processing' | 'completed' | 'failed';

// 合成任务响应
interface CompositeVideoResponse {
  task_id: number;
  status: string;
  composite_video_path: string | null;
  error_message: string | null;
}

// 人声去除任务响应
interface VocalRemovalResponse {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  video_url: string;
  output_video_path: string | null;
  error_message: string | null;
}

// 评分历史记录类型
interface ScoreRecord {
  id: number;
  clipPath: string;
  score: number | null;
  feedback: string | null;
  wordScores: WordScore[];
  createdAt: string;
}

// 字典数据类型
interface WordDefinition {
  partOfSpeech?: string;
  pos?: string;
  definition?: string;
  meaning?: string;
  definitionCN?: string;
  meaning_cn?: string;
}

interface WordExample {
  sentence: string;
  translation?: string;
}

interface WordCollocation {
  phrase: string;
  translation?: string;
}

interface WordData {
  word: string;
  phonetic?: string;
  definitions: WordDefinition[];
  collocations?: WordCollocation[];
  examples?: WordExample[];
  etymology?: string;
}

interface DictResponse {
  found: boolean;
  data: WordData | null;
  task_created: boolean;
}

interface DictStatusResponse {
  word: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
}

export default function DubbingScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const router = useRouter();
  const { id, seasonId, episodeName, index } = useLocalSearchParams<{ 
    id: string; 
    seasonId: string; 
    episodeName: string;
    index: string;
  }>();

  // id 现在是 clipPath
  const clipPath = id ? decodeURIComponent(id) : '';
  const decodedEpisodeName = episodeName ? decodeURIComponent(episodeName) : '';
  const clipIndex = index ? parseInt(index) : 0;

  const [clip, setClip] = useState<DubbingClip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const videoRef = useRef<Video>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const playbackSoundRef = useRef<Audio.Sound | null>(null);
  const isCreatingRecordingRef = useRef<boolean>(false); // 防止并发创建录音
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoPosition, setVideoPosition] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [scoringResult, setScoringResult] = useState<ScoringResult | null>(null);
  const [isPlayingRecording, setIsPlayingRecording] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);

  // 评分历史相关状态
  const [scoreHistory, setScoreHistory] = useState<ScoreRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<ScoreRecord | null>(null);
  const [showHistoryDetailModal, setShowHistoryDetailModal] = useState(false);

  // 字典相关状态
  const [showDictModal, setShowDictModal] = useState(false);
  const [dictWord, setDictWord] = useState<string>('');
  const [dictData, setDictData] = useState<WordData | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const [dictError, setDictError] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 配音模式相关状态
  const [dubbingMode, setDubbingMode] = useState<DubbingMode>('score');
  const [compositeStatus, setCompositeStatus] = useState<CompositeStatus>('idle');
  const [compositeTaskId, setCompositeTaskId] = useState<number | null>(null);
  const [compositeVideoPath, setCompositeVideoPath] = useState<string | null>(null);
  const [compositeError, setCompositeError] = useState<string | null>(null);
  const [showCompositeModal, setShowCompositeModal] = useState(false);
  const compositePollingRef = useRef<NodeJS.Timeout | null>(null);
  
  // 去人声视频相关状态
  const [vocalRemovedVideoUrl, setVocalRemovedVideoUrl] = useState<string | null>(null);
  const [vocalRemovedLocalUri, setVocalRemovedLocalUri] = useState<string | null>(null); // 本地缓存路径
  const [vocalRemovalStatus, setVocalRemovalStatus] = useState<'idle' | 'pending' | 'processing' | 'downloading' | 'completed' | 'failed'>('idle');
  const vocalRemovalPollingRef = useRef<NodeJS.Timeout | null>(null);
  
  // 下载状态
  const [downloading, setDownloading] = useState(false);

  // 视频配音相关状态
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [cameraRecordingUri, setCameraRecordingUri] = useState<string | null>(null);
  const [videoDubbingStatus, setVideoDubbingStatus] = useState<'idle' | 'recording' | 'recorded' | 'uploading' | 'processing' | 'completed' | 'failed'>('idle');
  const [showVideoDubbingConfirm, setShowVideoDubbingConfirm] = useState(false); // 录制完成确认对话框

  // 进度条宽度
  const progressBarWidth = width - 32;

  useEffect(() => {
    loadClip();
    loadScoreHistory();
  }, [seasonId, decodedEpisodeName, clipPath]);

  useEffect(() => {
    // 请求麦克风权限并配置播放模式
    (async () => {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') {
          setError('需要麦克风权限才能录音');
          return;
        }
        
        // 初始化为播放模式（音量正常）
        // 只有在开始录音时才切换到录音模式
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,  // 播放模式，音量正常
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: false,
        });
      } catch (err) {
        console.error('初始化音频失败:', err);
      }
    })();

    // 组件卸载时清理
    return () => {
      const cleanup = async () => {
        try {
          if (recordingRef.current) {
            await recordingRef.current.stopAndUnloadAsync();
          }
          if (playbackSoundRef.current) {
            await playbackSoundRef.current.unloadAsync();
          }
        } catch (err) {
          // 忽略清理时的错误
        }
      };
      cleanup();
    };
  }, []);

  const loadClip = async () => {
    if (!seasonId || !decodedEpisodeName || !clipPath) {
      setError('参数不完整');
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await fetchClipByPath(seasonId, decodedEpisodeName, clipPath);
      if (data) {
        setClip(data);
      } else {
        setError('配音片段不存在');
      }
    } catch (err) {
      console.error('加载配音片段失败:', err);
      setError('加载失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 加载评分历史
  const loadScoreHistory = async () => {
    if (!clipPath) return;
    
    setLoadingHistory(true);
    try {
      const userId = await getUserId();
      const response = await fetch(API_ENDPOINTS.clipRecords(userId, clipPath));
      if (response.ok) {
        const data = await response.json();
        // 服务器可能返回 { items: [...] } 或直接数组
        const items = data.items || data;
        setScoreHistory(Array.isArray(items) ? items : []);
      }
    } catch (err) {
      console.error('加载评分历史失败:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // 查询字典
  const lookupWord = async (word: string) => {
    // 清理单词（移除标点符号）
    const cleanWord = word.replace(/[.,!?;:'"()]/g, '').toLowerCase();
    if (!cleanWord) return;

    setDictWord(cleanWord);
    setShowDictModal(true);
    setDictLoading(true);
    setDictError(null);
    setDictData(null);

    // 清除之前的轮询
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    try {
      const response = await fetch(API_ENDPOINTS.wordLookup(cleanWord));
      const result: DictResponse = await response.json();

      if (result.found && result.data) {
        setDictData(result.data);
        setDictLoading(false);
      } else if (result.task_created) {
        // 开始轮询
        startPolling(cleanWord);
      } else {
        setDictError('单词未找到');
        setDictLoading(false);
      }
    } catch (err) {
      console.error('查询字典失败:', err);
      setDictError('查询失败，请重试');
      setDictLoading(false);
    }
  };

  // 轮询任务状态
  const startPolling = (word: string) => {
    let pollCount = 0;
    const maxPolls = 30; // 最多轮询30次（30秒）

    pollIntervalRef.current = setInterval(async () => {
      pollCount++;
      
      if (pollCount > maxPolls) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setDictError('查询超时，请稍后重试');
        setDictLoading(false);
        return;
      }

      try {
        const statusResponse = await fetch(API_ENDPOINTS.wordStatus(word));
        const statusResult: DictStatusResponse = await statusResponse.json();

        if (statusResult.status === 'completed') {
          // 任务完成，重新获取数据
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          
          const dataResponse = await fetch(API_ENDPOINTS.wordLookup(word));
          const dataResult: DictResponse = await dataResponse.json();
          
          if (dataResult.found && dataResult.data) {
            setDictData(dataResult.data);
          } else {
            setDictError('获取单词数据失败');
          }
          setDictLoading(false);
        } else if (statusResult.status === 'failed') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setDictError(statusResult.error_message || '查询失败');
          setDictLoading(false);
        }
        // pending 或 processing 状态继续轮询
      } catch (err) {
        console.error('轮询状态失败:', err);
      }
    }, 1000);
  };

  // 关闭字典弹窗
  const closeDictModal = () => {
    setShowDictModal(false);
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // 将句子拆分成单词数组
  const splitTextToWords = (text: string): string[] => {
    // 保留标点符号但作为单独的元素
    return text.split(/(\s+)/).filter(s => s.trim());
  };

  const handleBack = () => {
    router.back();
  };

  // 点击视频区域播放/暂停
  const handleVideoPress = async () => {
    if (videoRef.current) {
      if (isPlaying) {
        await videoRef.current.pauseAsync();
      } else {
        // 确保是播放模式（音量正常）
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: false,
        });
        
        // 如果视频还没开始播放过，从头开始
        if (videoPosition === 0 || videoPosition >= videoDuration) {
          await videoRef.current.replayAsync();
        } else {
          await videoRef.current.playAsync();
        }
      }
    }
  };

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setIsPlaying(status.isPlaying);
      
      // 更新视频时长和当前位置
      if (status.durationMillis) {
        setVideoDuration(status.durationMillis);
      }
      if (status.positionMillis !== undefined && !isSeeking) {
        setVideoPosition(status.positionMillis);
      }
      
      if (status.didJustFinish) {
        setIsPlaying(false);
        setVideoPosition(0);
      }
    }
  };

  // 处理进度条拖动
  const handleSeek = async (locationX: number) => {
    if (!videoRef.current || videoDuration === 0) return;
    
    // 计算新的位置
    const percentage = Math.max(0, Math.min(1, locationX / progressBarWidth));
    const newPosition = percentage * videoDuration;
    
    setVideoPosition(newPosition);
    await videoRef.current.setPositionAsync(newPosition);
  };

  const handleProgressBarPress = async (event: GestureResponderEvent) => {
    const { locationX } = event.nativeEvent;
    setIsSeeking(true);
    await handleSeek(locationX);
    setIsSeeking(false);
  };

  // 格式化时间
  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // 格式化日期时间
  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  };

  // 计算进度百分比
  const progressPercentage = videoDuration > 0 ? (videoPosition / videoDuration) * 100 : 0;

  // 清理录音资源
  const forceCleanupRecording = async () => {
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (e) {
        // 忽略
      }
      recordingRef.current = null;
    }
    
    // 重置音频模式
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
      });
    } catch (e) {
      // 忽略
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
      
      // 检查是否正在创建录音，防止并发
      if (isCreatingRecordingRef.current) {
        return;
      }
      isCreatingRecordingRef.current = true;
      
      // 如果当前状态是已评分，先重置状态
      if (recordingStatus === 'scored') {
        setRecordingUri(null);
        setScoringResult(null);
      }
      
      // 停止视频播放
      if (videoRef.current) {
        await videoRef.current.pauseAsync();
      }

      // 清理之前的录音资源
      await forceCleanupRecording();

      // 设置为录音模式
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
      });

      // 创建录音
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      recordingRef.current = recording;
      setRecordingStatus('recording');
    } catch (err) {
      console.error('开始录音失败:', err);
      setError('开始录音失败，请重试');
      
      // 尝试重置音频模式
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: false,
        });
      } catch (e) {
        // 忽略
      }
    } finally {
      isCreatingRecordingRef.current = false;
    }
  };

  const stopRecording = async () => {
    try {
      if (!recordingRef.current) return;

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      
      setRecordingUri(uri);
      setRecordingStatus('recorded');
      
      // 停止录音后重置音频模式为播放模式
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
      });
    } catch (err) {
      console.error('停止录音失败:', err);
      setError('停止录音失败，请重试');
      setRecordingStatus('idle');
      
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });
      } catch (e) {
        // 忽略
      }
    }
  };

  const playRecording = async () => {
    if (!recordingUri) return;

    try {
      // 如果正在播放，先停止
      if (playbackSoundRef.current) {
        await playbackSoundRef.current.stopAsync();
        await playbackSoundRef.current.unloadAsync();
        playbackSoundRef.current = null;
        setIsPlayingRecording(false);
        
        // 同时停止视频
        if (videoRef.current) {
          await videoRef.current.pauseAsync();
        }
        return;
      }

      // 切换到播放模式
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      // 将视频重置到开头
      if (videoRef.current) {
        await videoRef.current.setPositionAsync(0);
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: recordingUri },
        { shouldPlay: true },
        async (status) => {
          if (status.isLoaded && status.didJustFinish) {
            // 播放完成
            setIsPlayingRecording(false);
            sound.unloadAsync();
            playbackSoundRef.current = null;
            
            // 停止视频
            if (videoRef.current) {
              await videoRef.current.pauseAsync();
            }
            
            // 切回录音模式
            Audio.setAudioModeAsync({
              allowsRecordingIOS: true,
              playsInSilentModeIOS: true,
            });
          }
        }
      );
      
      playbackSoundRef.current = sound;
      setIsPlayingRecording(true);
      
      // 同时播放视频（静音，因为要听自己的录音）
      if (videoRef.current) {
        await videoRef.current.setIsMutedAsync(true);
        await videoRef.current.playAsync();
      }
    } catch (err) {
      console.error('播放录音失败:', err);
      setError('播放录音失败');
      setIsPlayingRecording(false);
    }
  };

  const submitRecording = async () => {
    if (!recordingUri || !clip) return;

    setRecordingStatus('uploading');
    setError(null);

    try {
      const userId = await getUserId();
      
      // 1. 直接调用 Vosk 评分服务
      const voskFormData = new FormData();
      const audioFile = {
        uri: recordingUri,
        type: 'audio/m4a',
        name: 'recording.m4a',
      } as any;
      voskFormData.append('audio', audioFile);
      voskFormData.append('text', clip.originalText);

      console.log('正在调用 Vosk 服务:', API_ENDPOINTS.voskScore);
      const voskResponse = await fetch(API_ENDPOINTS.voskScore, {
        method: 'POST',
        body: voskFormData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!voskResponse.ok) {
        throw new Error(`Vosk 评分失败: ${voskResponse.status}`);
      }

      const result: ScoringResult = await voskResponse.json();
      console.log('Vosk 服务返回的评分结果:', JSON.stringify(result, null, 2));
      
      // 2. 将评分结果保存到后端（异步，不阻塞用户体验）
      saveScoreToBackend(userId, clipPath, seasonId, result).catch(err => {
        console.error('保存评分记录失败:', err);
      });

      setScoringResult(result);
      setRecordingStatus('scored');
      setShowScoreModal(true);
      
      // 重新加载评分历史
      loadScoreHistory();
    } catch (err) {
      console.error('提交评分失败:', err);
      // 模拟评分结果（用于演示）
      const mockResult: ScoringResult = {
        overallScore: Math.floor(Math.random() * 30) + 70,
        phonemeScores: [],
        wordScores: clip.originalText.split(' ').map(word => ({
          word,
          score: Math.floor(Math.random() * 30) + 70,
          phonemes: [],
        })),
        feedback: '发音不错！继续保持！',
      };
      setScoringResult(mockResult);
      setRecordingStatus('scored');
      setShowScoreModal(true);
    }
  };

  // 将评分结果保存到后端
  const saveScoreToBackend = async (
    userId: string, 
    clipPath: string, 
    seasonId: string | undefined, 
    result: ScoringResult
  ) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/save-score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          clip_path: clipPath,
          season_id: seasonId,
          score: result.overallScore,
          feedback: result.feedback,
          word_scores: result.wordScores,
        }),
      });
      
      if (!response.ok) {
        console.warn('保存评分记录返回非 200:', response.status);
      }
    } catch (err) {
      console.error('保存评分记录网络错误:', err);
    }
  };

  const resetRecording = async () => {
    try {
      setShowScoreModal(false);
      
      // 重置音频模式
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: false,
        });
      } catch (e) {
        // 忽略
      }
      
      // 释放录音实例
      if (recordingRef.current) {
        try {
          await recordingRef.current.stopAndUnloadAsync();
        } catch (e) {
          // 忽略
        }
        recordingRef.current = null;
      }
      
      // 停止播放
      if (playbackSoundRef.current) {
        try {
          await playbackSoundRef.current.stopAsync();
          await playbackSoundRef.current.unloadAsync();
        } catch (e) {
          // 忽略
        }
        playbackSoundRef.current = null;
        setIsPlayingRecording(false);
      }
      
      setRecordingUri(null);
      setScoringResult(null);
      setRecordingStatus('idle');
    } catch (err) {
      console.error('重置录音失败:', err);
    }
  };

  const handleBackFromScore = async () => {
    setShowScoreModal(false);
    // 先释放音频资源再返回
    await resetRecording();
    router.back();
  };
  
  // 关闭评分弹窗（只关闭弹窗，不重置状态，用户可以再次查看）
  const closeScoreModal = async () => {
    setShowScoreModal(false);
    // 重要：关闭弹窗时也要重置音频模式，避免下次录音失败
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
      });
    } catch (e) {
      // 忽略
    }
  };

  // 查看历史记录详情
  const handleViewHistoryDetail = (record: ScoreRecord) => {
    setSelectedHistoryRecord(record);
    setShowHistoryModal(false);
    setShowHistoryDetailModal(true);
  };

  // 关闭历史详情弹窗
  const handleCloseHistoryDetail = () => {
    setShowHistoryDetailModal(false);
    setSelectedHistoryRecord(null);
  };

  // ===== 跟读录制模式相关函数 =====
  
  // 切换模式
  const switchMode = async (mode: DubbingMode) => {
    if (mode === dubbingMode) return;
    
    // 切换前重置状态
    await resetRecording();
    await resetComposite();
    await resetVideoDubbing();
    
    setDubbingMode(mode);
    
    // 切换到录制模式时，自动开始准备去人声视频
    if ((mode === 'record' || mode === 'video') && clip) {
      prepareVocalRemovedVideoInBackground();
    }
    
    // 切换到视频配音模式时，请求摄像头权限
    if (mode === 'video' && !cameraPermission?.granted) {
      requestCameraPermission();
    }
  };
  
  // 重置视频配音状态
  const resetVideoDubbing = async () => {
    setCameraRecordingUri(null);
    setVideoDubbingStatus('idle');
    setShowVideoDubbingConfirm(false);
    
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
      });
    } catch (e) {
      // 忽略
    }
  };
  
  // 下载视频到本地
  const downloadVideoToLocal = async (remoteUrl: string): Promise<string> => {
    const fileName = `vocal_removed_${Date.now()}.mp4`;
    const localUri = `${FileSystem.cacheDirectory}${fileName}`;
    
    const downloadResult = await FileSystem.downloadAsync(remoteUrl, localUri);
    
    if (downloadResult.status !== 200) {
      throw new Error(`下载失败，状态码: ${downloadResult.status}`);
    }
    
    const fileInfo = await FileSystem.getInfoAsync(downloadResult.uri);
    if (!fileInfo.exists) {
      throw new Error('下载的文件不存在');
    }
    
    return downloadResult.uri;
  };

  // 后台准备去人声视频（不阻塞 UI）
  const prepareVocalRemovedVideoInBackground = async () => {
    if (!clip) return;
    
    // 如果已经有本地缓存的视频，不需要再准备
    if (vocalRemovedLocalUri && vocalRemovalStatus === 'completed') return;
    
    // 如果正在处理中，不要重复请求
    if (vocalRemovalStatus === 'pending' || vocalRemovalStatus === 'processing' || vocalRemovalStatus === 'downloading') return;
    
    setVocalRemovalStatus('pending');
    
    try {
      const result = await requestVocalRemoval(clip.videoUrl);
      
      let remoteUrl: string;
      
      if (result.status === 'completed' && result.output_video_path) {
        remoteUrl = getVocalRemovedVideoUrl(result.output_video_path);
      } else if (result.status === 'pending' || result.status === 'processing') {
        setVocalRemovalStatus('processing');
        remoteUrl = await pollVocalRemovalStatus(clip.videoUrl);
      } else {
        throw new Error(result.error_message || '处理失败');
      }
      
      // 下载到本地
      setVocalRemovalStatus('downloading');
      const localUri = await downloadVideoToLocal(remoteUrl);
      
      setVocalRemovedVideoUrl(remoteUrl);
      setVocalRemovedLocalUri(localUri);
      setVocalRemovalStatus('completed');
    } catch (err: any) {
      console.error('准备视频失败:', err);
      setVocalRemovalStatus('failed');
      setCompositeError(`准备视频失败: ${err.message}`);
    }
  };

  // 重置合成状态
  const resetComposite = async () => {
    // 重置音频模式
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
      });
    } catch (e) {
      // 忽略
    }
    
    // 释放录音实例
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (e) {
        // 忽略
      }
      recordingRef.current = null;
    }
    
    // 释放播放实例
    if (playbackSoundRef.current) {
      try {
        await playbackSoundRef.current.unloadAsync();
      } catch (e) {
        // 忽略
      }
      playbackSoundRef.current = null;
    }
    
    setCompositeStatus('idle');
    setCompositeTaskId(null);
    setCompositeVideoPath(null);
    setCompositeError(null);
    setShowCompositeModal(false);
    setRecordingUri(null);
    setIsPlayingRecording(false);
    
    // 清除轮询
    if (compositePollingRef.current) {
      clearInterval(compositePollingRef.current);
      compositePollingRef.current = null;
    }
    if (vocalRemovalPollingRef.current) {
      clearInterval(vocalRemovalPollingRef.current);
      vocalRemovalPollingRef.current = null;
    }
  };

  // 关闭合成弹窗
  const closeCompositeModal = async () => {
    setShowCompositeModal(false);
    
    // 重置音频模式
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
      });
    } catch (e) {
      // 忽略
    }
  };

  // 请求去人声视频
  const requestVocalRemoval = async (videoUrl: string): Promise<VocalRemovalResponse> => {
    const response = await fetch(API_ENDPOINTS.vocalRemoval, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ video_url: videoUrl }),
    });
    
    if (!response.ok) {
      throw new Error(`请求失败: ${response.status}`);
    }
    
    return response.json();
  };

  // 查询去人声任务状态
  const checkVocalRemovalStatus = async (videoUrl: string): Promise<VocalRemovalResponse> => {
    const response = await fetch(API_ENDPOINTS.vocalRemovalStatus(videoUrl));
    
    if (!response.ok) {
      throw new Error(`查询失败: ${response.status}`);
    }
    
    return response.json();
  };

  // 轮询去人声任务状态
  const pollVocalRemovalStatus = (videoUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      let pollCount = 0;
      const maxPolls = 120; // 最多轮询2分钟

      vocalRemovalPollingRef.current = setInterval(async () => {
        pollCount++;
        
        if (pollCount > maxPolls) {
          if (vocalRemovalPollingRef.current) {
            clearInterval(vocalRemovalPollingRef.current);
            vocalRemovalPollingRef.current = null;
          }
          setVocalRemovalStatus('failed');
          reject(new Error('处理超时，请稍后重试'));
          return;
        }

        try {
          const result = await checkVocalRemovalStatus(videoUrl);

          if (result.status === 'completed' && result.output_video_path) {
            if (vocalRemovalPollingRef.current) {
              clearInterval(vocalRemovalPollingRef.current);
              vocalRemovalPollingRef.current = null;
            }
            setVocalRemovalStatus('completed');
            const fullUrl = getVocalRemovedVideoUrl(result.output_video_path);
            setVocalRemovedVideoUrl(fullUrl);
            resolve(fullUrl);
          } else if (result.status === 'failed') {
            if (vocalRemovalPollingRef.current) {
              clearInterval(vocalRemovalPollingRef.current);
              vocalRemovalPollingRef.current = null;
            }
            setVocalRemovalStatus('failed');
            reject(new Error(result.error_message || '处理失败'));
          }
          // pending 或 processing 状态继续轮询
        } catch (err) {
          console.error('轮询去人声状态失败:', err);
        }
      }, 1000);
    });
  };

  // 开始跟读录制（视频播放 + 录音同步）
  const startFollowRecording = async () => {
    try {
      setError(null);
      setCompositeError(null);
      
      // 检查是否正在创建录音，防止并发
      if (isCreatingRecordingRef.current) return;
      isCreatingRecordingRef.current = true;
      
      // 检查去人声视频是否准备好
      if (!vocalRemovedLocalUri || vocalRemovalStatus !== 'completed') {
        setCompositeError('视频还在准备中，请稍候');
        isCreatingRecordingRef.current = false;
        return;
      }
      
      // 清理之前的录音资源
      await forceCleanupRecording();

      // 设置录音模式
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
      });

      // 创建录音
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      recordingRef.current = recording;
      setCompositeStatus('recording');
      
      // 将视频重置到开头并静音播放
      if (videoRef.current) {
        await videoRef.current.setIsMutedAsync(true);
        await videoRef.current.setPositionAsync(0);
        await videoRef.current.playAsync();
      }
    } catch (err) {
      console.error('开始录制失败:', err);
      setError('开始录制失败，请重试');
      setCompositeStatus('idle');
      
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });
      } catch (e) {
        // 忽略
      }
    } finally {
      isCreatingRecordingRef.current = false;
    }
  };

  // 处理视频播放状态更新（用于跟读模式）
  const handleFollowPlaybackStatus = (status: AVPlaybackStatus) => {
    handlePlaybackStatusUpdate(status);
    
    // 如果是跟读录制模式且视频播放完成，自动停止录音
    if (dubbingMode === 'record' && compositeStatus === 'recording') {
      if (status.isLoaded && status.didJustFinish) {
        stopFollowRecording();
      }
    }
  };

  // 停止跟读录制
  const stopFollowRecording = async () => {
    try {
      if (!recordingRef.current) return;

      // 停止视频播放并恢复声音
      if (videoRef.current) {
        await videoRef.current.pauseAsync();
        await videoRef.current.setIsMutedAsync(false);
      }

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      
      setRecordingUri(uri);
      setCompositeStatus('recorded');
      
      // 停止录音后重置音频模式为播放模式
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
      });
    } catch (err) {
      console.error('停止跟读录制失败:', err);
      setError('停止录制失败，请重试');
      setCompositeStatus('idle');
      
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });
      } catch (e) {
        // 忽略
      }
    }
  };

  // ===== 视频配音模式相关函数 =====
  
  // 开始视频配音录制（摄像头录制 + 视频播放同步）
  const startVideoDubbingRecording = async () => {
    if (!cameraRef.current) {
      setCompositeError('摄像头未准备好');
      return;
    }
    
    if (!vocalRemovedLocalUri || vocalRemovalStatus !== 'completed') {
      setCompositeError('视频还在准备中，请稍候');
      return;
    }
    
    try {
      setError(null);
      setCompositeError(null);
      
      // 配置音频会话，允许同时播放和录制
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      setVideoDubbingStatus('recording');
      
      // 将视频重置到开头并静音播放
      if (videoRef.current) {
        await videoRef.current.setIsMutedAsync(true);
        await videoRef.current.setPositionAsync(0);
        await videoRef.current.playAsync();
      }
      
      // 开始摄像头录制
      const videoRecording = await cameraRef.current.recordAsync({
        maxDuration: Math.ceil((clip?.duration || 10) + 1),
      });
      
      if (videoRecording?.uri) {
        setCameraRecordingUri(videoRecording.uri);
        setVideoDubbingStatus('recorded');
        setShowVideoDubbingConfirm(true);
      } else {
        throw new Error('录制失败，未获取到视频文件');
      }
    } catch (err) {
      console.error('视频配音录制失败:', err);
      setCompositeError('录制失败，请重试');
      setVideoDubbingStatus('idle');
      
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });
      } catch (e) {
        // 忽略
      }
    }
  };
  
  // 停止视频配音录制
  const stopVideoDubbingRecording = async () => {
    try {
      if (videoRef.current) {
        await videoRef.current.pauseAsync();
        await videoRef.current.setIsMutedAsync(false);
      }
      
      if (cameraRef.current) {
        cameraRef.current.stopRecording();
      }
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
      });
    } catch (err) {
      console.error('停止视频配音录制失败:', err);
    }
  };
  
  // 处理视频配音模式下视频播放完成
  const handleVideoDubbingPlaybackStatus = (status: AVPlaybackStatus) => {
    handlePlaybackStatusUpdate(status);
    
    if (dubbingMode === 'video' && videoDubbingStatus === 'recording') {
      if (status.isLoaded && status.didJustFinish) {
        stopVideoDubbingRecording();
      }
    }
  };
  
  // 播放视频配音录制的内容（试听）
  const playVideoDubbingRecording = async () => {
    if (!cameraRecordingUri) return;
    
    // 将视频重置到开头
    if (videoRef.current) {
      await videoRef.current.setIsMutedAsync(true);
      await videoRef.current.setPositionAsync(0);
      await videoRef.current.playAsync();
    }
    
    // TODO: 同时播放录制的视频（需要另一个 Video 组件）
    setIsPlayingRecording(true);
  };
  
  // 提交视频配音合成任务
  const submitVideoDubbing = async () => {
    if (!cameraRecordingUri || !clip) return;

    setVideoDubbingStatus('uploading');
    setCompositeError(null);

    try {
      const userId = await getUserId();
      
      const formData = new FormData();
      const videoFile = {
        uri: cameraRecordingUri,
        type: 'video/mp4',
        name: 'camera_recording.mp4',
      } as any;
      formData.append('user_video', videoFile);
      formData.append('video_url', clip.videoUrl);
      formData.append('clip_path', clipPath);
      formData.append('user_id', userId);
      formData.append('mode', 'video');
      if (seasonId) formData.append('season_id', seasonId);
      if (clip.originalText) formData.append('original_text', clip.originalText);
      if (clip.translationCN) formData.append('translation_cn', clip.translationCN);
      if (clip.thumbnail) formData.append('thumbnail', clip.thumbnail);
      formData.append('duration', String(clip.duration || 0));

      const response = await fetch(API_ENDPOINTS.compositeVideo, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`提交失败: ${response.status} - ${text}`);
      }

      const result = await response.json();
      
      setCompositeTaskId(result.task_id);
      setVideoDubbingStatus('processing');
      startCompositePolling(result.task_id, 'video');
      
    } catch (err: any) {
      console.error('视频配音提交失败:', err);
      setCompositeError(`提交失败: ${err.message}`);
      setVideoDubbingStatus('recorded');
    }
  };

  // 上传录音并提交合成任务
  const submitCompositeVideo = async () => {
    if (!recordingUri || !clip) return;

    setCompositeStatus('uploading');
    setCompositeError(null);

    try {
      const userId = await getUserId();
      
      const formData = new FormData();
      const audioFile = {
        uri: recordingUri,
        type: 'audio/m4a',
        name: 'recording.m4a',
      } as any;
      formData.append('audio', audioFile);
      formData.append('video_url', clip.videoUrl);
      formData.append('clip_path', clipPath);
      formData.append('user_id', userId);
      if (seasonId) formData.append('season_id', seasonId);
      if (clip.originalText) formData.append('original_text', clip.originalText);
      if (clip.translationCN) formData.append('translation_cn', clip.translationCN);
      if (clip.thumbnail) formData.append('thumbnail', clip.thumbnail);
      formData.append('duration', String(clip.duration || 0));

      const response = await fetch(API_ENDPOINTS.compositeVideo, {
        method: 'POST',
        body: formData,
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`提交失败: ${response.status} - ${responseText}`);
      }

      const result: CompositeVideoResponse = JSON.parse(responseText);
      
      setCompositeTaskId(result.task_id);
      setCompositeStatus('processing');
      startCompositePolling(result.task_id);
      
    } catch (err) {
      console.error('提交合成任务失败:', err);
      setCompositeError(`提交失败: ${err}`);
      setCompositeStatus('recorded');
    }
  };

  // 轮询合成任务状态
  // mode: 'audio' (录音配音) 或 'video' (视频配音)
  const startCompositePolling = (taskId: number, mode: 'audio' | 'video' = 'audio') => {
    let pollCount = 0;
    const maxPolls = 120; // 最多轮询2分钟

    compositePollingRef.current = setInterval(async () => {
      pollCount++;
      
      if (pollCount > maxPolls) {
        if (compositePollingRef.current) {
          clearInterval(compositePollingRef.current);
          compositePollingRef.current = null;
        }
        setCompositeError('处理超时，请稍后重试');
        if (mode === 'video') {
          setVideoDubbingStatus('failed');
        } else {
          setCompositeStatus('failed');
        }
        return;
      }

      try {
        const response = await fetch(API_ENDPOINTS.compositeVideoStatus(taskId));
        const result: CompositeVideoResponse = await response.json();

        if (result.status === 'completed') {
          if (compositePollingRef.current) {
            clearInterval(compositePollingRef.current);
            compositePollingRef.current = null;
          }
          setCompositeVideoPath(result.composite_video_path);
          if (mode === 'video') {
            setVideoDubbingStatus('completed');
          } else {
            setCompositeStatus('completed');
          }
          setShowCompositeModal(true);
        } else if (result.status === 'failed') {
          if (compositePollingRef.current) {
            clearInterval(compositePollingRef.current);
            compositePollingRef.current = null;
          }
          setCompositeError(result.error_message || '处理失败');
          if (mode === 'video') {
            setVideoDubbingStatus('failed');
          } else {
            setCompositeStatus('failed');
          }
        }
        // pending 或 processing 状态继续轮询
      } catch (err) {
        console.error('轮询状态失败:', err);
      }
    }, 1000);
  };

  // 清理合成轮询和去人声轮询
  useEffect(() => {
    return () => {
      if (compositePollingRef.current) {
        clearInterval(compositePollingRef.current);
      }
      if (vocalRemovalPollingRef.current) {
        clearInterval(vocalRemovalPollingRef.current);
      }
    };
  }, []);

  // 下载合成视频
  const handleDownloadVideo = async () => {
    if (!compositeVideoPath) return;

    try {
      // 请求媒体库权限
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('权限不足', '需要存储权限才能下载视频');
        return;
      }

      setDownloading(true);

      const videoUrl = getStreamingVideoUrl(compositeVideoPath);
      const fileName = `dubbing_${Date.now()}.mp4`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;

      // 下载文件
      const downloadResult = await FileSystem.downloadAsync(videoUrl, fileUri);
      
      if (downloadResult.status !== 200) {
        throw new Error('下载失败');
      }

      // 保存到相册
      const asset = await MediaLibrary.createAssetAsync(downloadResult.uri);
      await MediaLibrary.createAlbumAsync('配音练习', asset, false);

      Alert.alert('下载成功', '视频已保存到相册');
    } catch (err) {
      console.error('下载失败:', err);
      Alert.alert('下载失败', '请重试');
    } finally {
      setDownloading(false);
    }
  };

  // 加载中状态
  if (loading) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <ThemedText style={[styles.loadingText, { color: colors.textSecondary }]}>
            加载中...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  // 错误状态
  if (error || !clip) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.cardBorder }]}>
          <Pressable style={styles.backButton} onPress={handleBack}>
            <IconSymbol name="chevron.left" size={24} color={colors.primary} />
          </Pressable>
          <ThemedText style={[styles.headerTitle, { color: colors.text }]}>配音练习</ThemedText>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorEmoji}>😥</ThemedText>
          <ThemedText style={[styles.errorText, { color: colors.textSecondary }]}>
            {error || '配音片段不存在'}
          </ThemedText>
          <Pressable 
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={loadClip}
          >
            <ThemedText style={styles.retryButtonText}>重试</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 顶部导航 */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.cardBorder }]}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <IconSymbol name="chevron.left" size={24} color={colors.primary} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: colors.text }]}>配音练习 #{clipIndex + 1}</ThemedText>
        <View style={styles.placeholder} />
      </View>

      {/* 视频播放区域 */}
      <View style={[styles.videoSection, dubbingMode === 'video' && styles.videoSectionSmall]}>
        <Pressable style={styles.videoTouchArea} onPress={handleVideoPress}>
          <Video
            ref={videoRef}
            source={{ uri: ((dubbingMode === 'record' || dubbingMode === 'video') && vocalRemovedLocalUri) ? vocalRemovedLocalUri : clip.videoUrl }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            onPlaybackStatusUpdate={
              dubbingMode === 'record' ? handleFollowPlaybackStatus : 
              dubbingMode === 'video' ? handleVideoDubbingPlaybackStatus : 
              handlePlaybackStatusUpdate
            }
            useNativeControls={false}
          />
          
          {/* 播放按钮 - 仅在暂停且非拖动时显示 */}
          {!isPlaying && (
            <View style={styles.playButtonOverlay}>
              <View style={[styles.playButton, { backgroundColor: colors.primary }]}>
                <IconSymbol name="play.fill" size={32} color="#FFFFFF" />
              </View>
            </View>
          )}
        </Pressable>
        
        {/* 视频配音模式下的文字覆盖层 */}
        {dubbingMode === 'video' && clip.originalText && (
          <View style={styles.videoTextOverlay}>
            <ThemedText style={styles.videoOverlayText} numberOfLines={2}>
              {clip.originalText}
            </ThemedText>
            {clip.translationCN && (
              <ThemedText style={styles.videoOverlayTranslation} numberOfLines={1}>
                {clip.translationCN}
              </ThemedText>
            )}
          </View>
        )}
        
        {/* 进度条区域 - 暂停时显示，或录制/试听时始终显示 */}
        {videoDuration > 0 && (!isPlaying || compositeStatus === 'recording' || videoDubbingStatus === 'recording' || isPlayingRecording) && (
          <View style={styles.progressContainer}>
            <ThemedText style={styles.timeText}>{formatTime(videoPosition)}</ThemedText>
            <Pressable 
              style={styles.progressBarContainer}
              onPress={handleProgressBarPress}
              disabled={compositeStatus === 'recording' || videoDubbingStatus === 'recording' || isPlayingRecording}
            >
              <View style={[styles.progressBarBackground, { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                <View 
                  style={[
                    styles.progressBarFill, 
                    { 
                      backgroundColor: (compositeStatus === 'recording' || videoDubbingStatus === 'recording') ? colors.error : colors.primary,
                      width: `${progressPercentage}%` 
                    }
                  ]} 
                />
                <View 
                  style={[
                    styles.progressThumb,
                    { 
                      backgroundColor: (compositeStatus === 'recording' || videoDubbingStatus === 'recording') ? colors.error : colors.primary,
                      left: `${progressPercentage}%`,
                    }
                  ]}
                />
              </View>
            </Pressable>
            <ThemedText style={styles.timeText}>{formatTime(videoDuration)}</ThemedText>
          </View>
        )}
      </View>

      {/* 台词显示区域 - 视频配音模式下隐藏 */}
      {dubbingMode !== 'video' && (
        <View style={[styles.textSection, styles.textSectionFixed, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <ScrollView 
            style={styles.textScrollView}
            contentContainerStyle={styles.textScrollContent}
            showsVerticalScrollIndicator={true}
          >
            <View style={styles.originalTextContainer}>
              <ThemedText style={[styles.quoteText, { color: colors.text }]}>"</ThemedText>
              <View style={styles.wordsContainer}>
                {splitTextToWords(clip.originalText).map((word, idx) => (
                  <Pressable 
                    key={idx} 
                    onPress={() => lookupWord(word)}
                    style={({ pressed }) => [
                      styles.wordButton,
                      pressed && styles.wordButtonPressed,
                    ]}
                  >
                    <ThemedText style={[styles.wordText, { color: colors.text }]}>
                      {word}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
              <ThemedText style={[styles.quoteText, { color: colors.text }]}>"</ThemedText>
            </View>
            <ThemedText style={[styles.translationText, { color: colors.textSecondary }]}>
              {clip.translationCN}
            </ThemedText>
            <ThemedText style={[styles.dictHint, { color: colors.textSecondary }]}>
              点击单词可查询释义
            </ThemedText>
            
            {/* 评分历史按钮 */}
            {scoreHistory.length > 0 && (
              <Pressable 
                style={[styles.historyBadgeInline, { backgroundColor: colors.primary + '20' }]}
                onPress={() => setShowHistoryModal(true)}
              >
                <IconSymbol name="clock.arrow.circlepath" size={14} color={colors.primary} />
                <ThemedText style={[styles.historyBadgeText, { color: colors.primary }]}>
                  查看历史记录 ({scoreHistory.length})
                </ThemedText>
              </Pressable>
            )}
          </ScrollView>
        </View>
      )}

      {/* 模式切换标签 */}
      <View style={[styles.modeTabContainer, { backgroundColor: colors.card, borderBottomColor: colors.cardBorder }]}>
        <Pressable 
          style={[
            styles.modeTab, 
            dubbingMode === 'score' && { backgroundColor: colors.primary }
          ]}
          onPress={() => switchMode('score')}
        >
          <IconSymbol name="star.fill" size={14} color={dubbingMode === 'score' ? '#FFFFFF' : colors.textSecondary} />
          <ThemedText style={[styles.modeTabText, { color: dubbingMode === 'score' ? '#FFFFFF' : colors.textSecondary }]}>
            评分
          </ThemedText>
        </Pressable>
        <Pressable 
          style={[
            styles.modeTab, 
            dubbingMode === 'record' && { backgroundColor: colors.primary }
          ]}
          onPress={() => switchMode('record')}
        >
          <IconSymbol name="mic.fill" size={14} color={dubbingMode === 'record' ? '#FFFFFF' : colors.textSecondary} />
          <ThemedText style={[styles.modeTabText, { color: dubbingMode === 'record' ? '#FFFFFF' : colors.textSecondary }]}>
            录音
          </ThemedText>
        </Pressable>
        <Pressable 
          style={[
            styles.modeTab, 
            dubbingMode === 'video' && { backgroundColor: colors.primary }
          ]}
          onPress={() => switchMode('video')}
        >
          <IconSymbol name="video.fill" size={14} color={dubbingMode === 'video' ? '#FFFFFF' : colors.textSecondary} />
          <ThemedText style={[styles.modeTabText, { color: dubbingMode === 'video' ? '#FFFFFF' : colors.textSecondary }]}>
            视频
          </ThemedText>
        </Pressable>
      </View>

      {/* 录音控制区域 */}
      <View style={styles.controlSection}>
        {/* 评分模式的控制 */}
        {dubbingMode === 'score' && (
          <>
            {recordingStatus === 'idle' && (
              <View style={styles.controls}>
                <ThemedText style={[styles.hint, { color: colors.textSecondary }]}>
                  点击下方按钮开始录音
                </ThemedText>
                <Pressable 
                  style={[styles.recordButton, { backgroundColor: colors.error }]}
                  onPress={startRecording}
                >
                  <IconSymbol name="mic.fill" size={40} color="#FFFFFF" />
                </Pressable>
                <ThemedText style={[styles.recordHint, { color: colors.textSecondary }]}>
                  按住录音
                </ThemedText>
              </View>
            )}

            {recordingStatus === 'recording' && (
              <View style={styles.controls}>
                <View style={styles.recordingIndicator}>
                  <View style={[styles.recordingDot, { backgroundColor: colors.error }]} />
                  <ThemedText style={[styles.recordingText, { color: colors.error }]}>
                    正在录音...
                  </ThemedText>
                </View>
                <Pressable 
                  style={[styles.recordButton, styles.recordingButtonStyle, { backgroundColor: colors.error }]}
                  onPress={stopRecording}
                >
                  <IconSymbol name="stop.fill" size={40} color="#FFFFFF" />
                </Pressable>
                <ThemedText style={[styles.recordHint, { color: colors.textSecondary }]}>
                  点击停止
                </ThemedText>
              </View>
            )}

            {recordingStatus === 'recorded' && (
              <View style={styles.controls}>
                <ThemedText style={[styles.hint, { color: colors.textSecondary }]}>
                  {isPlayingRecording ? '正在播放...' : '录音完成！'}
                </ThemedText>
                <View style={styles.actionButtons}>
                  <Pressable 
                    style={[
                      styles.actionButton, 
                      { 
                        backgroundColor: isPlayingRecording ? colors.primary : colors.backgroundSecondary, 
                        borderColor: colors.cardBorder 
                      }
                    ]}
                    onPress={playRecording}
                  >
                    <IconSymbol 
                      name={isPlayingRecording ? "stop.fill" : "play.fill"} 
                      size={24} 
                      color={isPlayingRecording ? "#FFFFFF" : colors.primary} 
                    />
                    <ThemedText style={[styles.actionButtonText, { color: isPlayingRecording ? "#FFFFFF" : colors.text }]}>
                      {isPlayingRecording ? '停止' : '试听'}
                    </ThemedText>
                  </Pressable>
                  <Pressable 
                    style={[styles.actionButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.cardBorder }]}
                    onPress={resetRecording}
                  >
                    <IconSymbol name="arrow.counterclockwise" size={24} color={colors.warning} />
                    <ThemedText style={[styles.actionButtonText, { color: colors.text }]}>重录</ThemedText>
                  </Pressable>
                  <Pressable 
                    style={[styles.actionButton, styles.submitButton, { backgroundColor: colors.success }]}
                    onPress={submitRecording}
                  >
                    <IconSymbol name="checkmark" size={24} color="#FFFFFF" />
                    <ThemedText style={[styles.actionButtonText, { color: '#FFFFFF' }]}>提交</ThemedText>
                  </Pressable>
                </View>
              </View>
            )}

            {recordingStatus === 'uploading' && (
              <View style={styles.controls}>
                <ActivityIndicator size="large" color={colors.primary} />
                <ThemedText style={[styles.uploadingText, { color: colors.textSecondary }]}>
                  正在评分中...
                </ThemedText>
              </View>
            )}

            {recordingStatus === 'scored' && (
              <View style={styles.controls}>
                <ThemedText style={[styles.hint, { color: colors.success }]}>
                  ✅ 评分完成！
                </ThemedText>
                <View style={styles.scoredButtonsRow}>
                  <Pressable 
                    style={[styles.viewScoreButton, { backgroundColor: colors.primary }]}
                    onPress={() => setShowScoreModal(true)}
                  >
                    <ThemedText style={styles.viewScoreButtonText}>查看评分结果</ThemedText>
                  </Pressable>
                  <Pressable 
                    style={[styles.viewScoreButton, { backgroundColor: colors.warning, marginLeft: 12 }]}
                    onPress={resetRecording}
                  >
                    <ThemedText style={styles.viewScoreButtonText}>重新录音</ThemedText>
                  </Pressable>
                </View>
              </View>
            )}
          </>
        )}

        {/* 录制配音模式的控制 */}
        {dubbingMode === 'record' && (
          <>
            {/* 正在准备去人声视频 */}
            {compositeStatus === 'idle' && (vocalRemovalStatus === 'pending' || vocalRemovalStatus === 'processing') && (
              <View style={styles.controls}>
                <ActivityIndicator size="large" color={colors.primary} />
                <ThemedText style={[styles.uploadingText, { color: colors.textSecondary }]}>
                  正在处理无人声视频...
                </ThemedText>
                <ThemedText style={[styles.processingHint, { color: colors.textSecondary }]}>
                  首次使用需要处理，请稍候
                </ThemedText>
              </View>
            )}

            {/* 正在下载视频到本地 */}
            {compositeStatus === 'idle' && vocalRemovalStatus === 'downloading' && (
              <View style={styles.controls}>
                <ActivityIndicator size="large" color={colors.primary} />
                <ThemedText style={[styles.uploadingText, { color: colors.textSecondary }]}>
                  正在下载视频到本地...
                </ThemedText>
                <ThemedText style={[styles.processingHint, { color: colors.textSecondary }]}>
                  即将完成
                </ThemedText>
              </View>
            )}

            {/* 准备失败 */}
            {compositeStatus === 'idle' && vocalRemovalStatus === 'failed' && (
              <View style={styles.controls}>
                <ThemedText style={[styles.hint, { color: colors.error }]}>
                  ❌ 视频准备失败
                </ThemedText>
                <ThemedText style={[styles.errorHint, { color: colors.textSecondary }]}>
                  {compositeError || '请重试'}
                </ThemedText>
                <Pressable 
                  style={[styles.viewScoreButton, { backgroundColor: colors.primary }]}
                  onPress={prepareVocalRemovedVideoInBackground}
                >
                  <ThemedText style={styles.viewScoreButtonText}>重新准备</ThemedText>
                </Pressable>
              </View>
            )}

            {/* 准备完成，可以开始录制 */}
            {compositeStatus === 'idle' && vocalRemovalStatus === 'completed' && (
              <View style={styles.controls}>
                <ThemedText style={[styles.hint, { color: colors.textSecondary }]}>
                  点击按钮，视频会自动播放，同时录制你的配音
                </ThemedText>
                <Pressable 
                  style={[styles.recordButton, { backgroundColor: colors.primary }]}
                  onPress={startFollowRecording}
                >
                  <IconSymbol name="video.fill" size={40} color="#FFFFFF" />
                </Pressable>
                <ThemedText style={[styles.recordHint, { color: colors.textSecondary }]}>
                  跟读录制
                </ThemedText>
                <ThemedText style={[styles.vocalRemovedHint, { color: colors.success }]}>
                  ✓ 已准备好无人声视频
                </ThemedText>
              </View>
            )}

            {/* 还没开始准备（刚进入但还没切换模式触发） */}
            {compositeStatus === 'idle' && vocalRemovalStatus === 'idle' && (
              <View style={styles.controls}>
                <ActivityIndicator size="large" color={colors.primary} />
                <ThemedText style={[styles.uploadingText, { color: colors.textSecondary }]}>
                  正在准备无人声视频...
                </ThemedText>
                <ThemedText style={[styles.processingHint, { color: colors.textSecondary }]}>
                  首次使用需要处理，请稍候
                </ThemedText>
              </View>
            )}

            {compositeStatus === 'recording' && (
              <View style={styles.controls}>
                <View style={styles.recordingIndicator}>
                  <View style={[styles.recordingDot, { backgroundColor: colors.error }]} />
                  <ThemedText style={[styles.recordingText, { color: colors.error }]}>
                    正在跟读录制...
                  </ThemedText>
                </View>
                
                {/* 录制进度条 */}
                <View style={styles.recordingProgressContainer}>
                  <View style={[styles.recordingProgressBar, { backgroundColor: colors.backgroundSecondary }]}>
                    <View 
                      style={[
                        styles.recordingProgressFill, 
                        { 
                          backgroundColor: colors.error,
                          width: `${progressPercentage}%` 
                        }
                      ]} 
                    />
                  </View>
                  <ThemedText style={[styles.recordingProgressText, { color: colors.text }]}>
                    {formatTime(videoPosition)} / {formatTime(videoDuration)}
                  </ThemedText>
                </View>
                
                <ThemedText style={[styles.recordHint, { color: colors.textSecondary }]}>
                  视频播完自动停止录制
                </ThemedText>
              </View>
            )}

            {compositeStatus === 'recorded' && (
              <View style={styles.controls}>
                <ThemedText style={[styles.hint, { color: colors.textSecondary }]}>
                  {isPlayingRecording ? '正在播放...' : '录制完成！'}
                </ThemedText>
                <View style={styles.actionButtons}>
                  <Pressable 
                    style={[
                      styles.actionButton, 
                      { 
                        backgroundColor: isPlayingRecording ? colors.primary : colors.backgroundSecondary, 
                        borderColor: colors.cardBorder 
                      }
                    ]}
                    onPress={playRecording}
                  >
                    <IconSymbol 
                      name={isPlayingRecording ? "stop.fill" : "play.fill"} 
                      size={24} 
                      color={isPlayingRecording ? "#FFFFFF" : colors.primary} 
                    />
                    <ThemedText style={[styles.actionButtonText, { color: isPlayingRecording ? "#FFFFFF" : colors.text }]}>
                      {isPlayingRecording ? '停止' : '试听'}
                    </ThemedText>
                  </Pressable>
                  <Pressable 
                    style={[styles.actionButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.cardBorder }]}
                    onPress={resetComposite}
                  >
                    <IconSymbol name="arrow.counterclockwise" size={24} color={colors.warning} />
                    <ThemedText style={[styles.actionButtonText, { color: colors.text }]}>重录</ThemedText>
                  </Pressable>
                  <Pressable 
                    style={[styles.actionButton, styles.submitButton, { backgroundColor: colors.success }]}
                    onPress={submitCompositeVideo}
                  >
                    <IconSymbol name="arrow.up.circle.fill" size={24} color="#FFFFFF" />
                    <ThemedText style={[styles.actionButtonText, { color: '#FFFFFF' }]}>上传</ThemedText>
                  </Pressable>
                </View>
                {compositeError && (
                  <ThemedText style={[styles.errorHint, { color: colors.error }]}>
                    {compositeError}
                  </ThemedText>
                )}
              </View>
            )}

            {compositeStatus === 'uploading' && (
              <View style={styles.controls}>
                <ActivityIndicator size="large" color={colors.primary} />
                <ThemedText style={[styles.uploadingText, { color: colors.textSecondary }]}>
                  正在上传...
                </ThemedText>
              </View>
            )}

            {compositeStatus === 'processing' && (
              <View style={styles.controls}>
                <ActivityIndicator size="large" color={colors.primary} />
                <ThemedText style={[styles.uploadingText, { color: colors.textSecondary }]}>
                  正在合成视频，请稍候...
                </ThemedText>
                <ThemedText style={[styles.processingHint, { color: colors.textSecondary }]}>
                  这可能需要1-2分钟
                </ThemedText>
              </View>
            )}

            {compositeStatus === 'completed' && (
              <View style={styles.controls}>
                <ThemedText style={[styles.hint, { color: colors.success }]}>
                  ✅ 合成完成！
                </ThemedText>
                <Pressable 
                  style={[styles.viewScoreButton, { backgroundColor: colors.primary }]}
                  onPress={() => setShowCompositeModal(true)}
                >
                  <ThemedText style={styles.viewScoreButtonText}>查看合成视频</ThemedText>
                </Pressable>
              </View>
            )}

            {compositeStatus === 'failed' && (
              <View style={styles.controls}>
                <ThemedText style={[styles.hint, { color: colors.error }]}>
                  ❌ 合成失败
                </ThemedText>
                <ThemedText style={[styles.errorHint, { color: colors.textSecondary }]}>
                  {compositeError || '请重试'}
                </ThemedText>
                <Pressable 
                  style={[styles.viewScoreButton, { backgroundColor: colors.primary }]}
                  onPress={resetComposite}
                >
                  <ThemedText style={styles.viewScoreButtonText}>重新录制</ThemedText>
                </Pressable>
              </View>
            )}
          </>
        )}

        {/* 视频配音模式的控制 */}
        {dubbingMode === 'video' && (
          <>
            {/* 摄像头预览（正方形） */}
            <View style={styles.cameraPreviewContainer}>
              {cameraPermission?.granted ? (
                <View style={styles.cameraPreviewWrapper}>
                  <CameraView
                    ref={cameraRef}
                    style={styles.cameraPreview}
                    facing="front"
                    mode="video"
                  />
                  {/* 准备中的覆盖层 */}
                  {videoDubbingStatus === 'idle' && (vocalRemovalStatus === 'pending' || vocalRemovalStatus === 'processing' || vocalRemovalStatus === 'downloading') && (
                    <View style={styles.cameraOverlay}>
                      <ActivityIndicator size="large" color="#FFFFFF" />
                      <ThemedText style={styles.cameraOverlayText}>
                        正在准备视频...
                      </ThemedText>
                    </View>
                  )}
                  {/* 开始录制按钮覆盖层 */}
                  {videoDubbingStatus === 'idle' && vocalRemovalStatus === 'completed' && (
                    <View style={styles.cameraOverlay}>
                      <Pressable 
                        style={[styles.videoDubbingButton, { backgroundColor: colors.error }]}
                        onPress={startVideoDubbingRecording}
                      >
                        <IconSymbol name="record.circle" size={28} color="#FFFFFF" />
                        <ThemedText style={styles.videoDubbingButtonText}>开始录制</ThemedText>
                      </Pressable>
                    </View>
                  )}
                  {/* 录制中的指示器 */}
                  {videoDubbingStatus === 'recording' && (
                    <View style={styles.cameraRecordingBadge}>
                      <View style={styles.recordingDotSmall} />
                      <ThemedText style={styles.cameraRecordingText}>REC</ThemedText>
                    </View>
                  )}
                  {/* 上传中/合成中的覆盖层 */}
                  {(videoDubbingStatus === 'uploading' || videoDubbingStatus === 'processing') && (
                    <View style={styles.cameraOverlay}>
                      <ActivityIndicator size="large" color="#FFFFFF" />
                      <ThemedText style={styles.cameraOverlayText}>
                        {videoDubbingStatus === 'uploading' ? '正在上传...' : '正在合成...'}
                      </ThemedText>
                    </View>
                  )}
                  {/* 合成完成的覆盖层 */}
                  {videoDubbingStatus === 'completed' && (
                    <View style={styles.cameraOverlay}>
                      <IconSymbol name="checkmark.circle.fill" size={48} color="#4CD964" />
                      <ThemedText style={styles.cameraOverlayText}>
                        合成完成！
                      </ThemedText>
                      <Pressable 
                        style={[styles.videoDubbingButton, { backgroundColor: colors.primary, marginTop: 12 }]}
                        onPress={() => setShowCompositeModal(true)}
                      >
                        <IconSymbol name="play.fill" size={20} color="#FFFFFF" />
                        <ThemedText style={styles.videoDubbingButtonText}>查看视频</ThemedText>
                      </Pressable>
                    </View>
                  )}
                </View>
              ) : (
                <View style={[styles.cameraPreview, styles.cameraPlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
                  <IconSymbol name="camera.fill" size={48} color={colors.textSecondary} />
                  <ThemedText style={[styles.cameraPlaceholderText, { color: colors.textSecondary }]}>
                    {cameraPermission === null ? '检查摄像头权限...' : '需要摄像头权限'}
                  </ThemedText>
                  {cameraPermission && !cameraPermission.granted && (
                    <Pressable 
                      style={[styles.permissionButton, { backgroundColor: colors.primary }]}
                      onPress={requestCameraPermission}
                    >
                      <ThemedText style={styles.permissionButtonText}>授权摄像头</ThemedText>
                    </Pressable>
                  )}
                </View>
              )}
            </View>

            {/* 正在录制 - 进度信息 */}
            {videoDubbingStatus === 'recording' && (
              <View style={styles.videoDubbingControlsCompact}>
                <ThemedText style={[styles.recordingTimeText, { color: colors.error }]}>
                  ● {formatTime(videoPosition)} / {formatTime(videoDuration)}
                </ThemedText>
              </View>
            )}

            {/* 录制完成 - 显示简单提示 */}
            {videoDubbingStatus === 'recorded' && (
              <View style={styles.videoDubbingControlsCompact}>
                <Pressable onPress={() => setShowVideoDubbingConfirm(true)}>
                  <ThemedText style={[styles.videoDubbingHint, { color: colors.primary }]}>
                    ✓ 录制完成，点击选择操作
                  </ThemedText>
                </Pressable>
              </View>
            )}

            {/* 合成失败 */}
            {videoDubbingStatus === 'failed' && (
              <View style={styles.videoDubbingControls}>
                <ThemedText style={[styles.videoDubbingHint, { color: colors.error }]}>
                  ❌ 合成失败
                </ThemedText>
                <ThemedText style={[styles.errorHint, { color: colors.textSecondary }]}>
                  {compositeError || '请重试'}
                </ThemedText>
                <Pressable 
                  style={[styles.viewScoreButton, { backgroundColor: colors.primary }]}
                  onPress={resetVideoDubbing}
                >
                  <ThemedText style={styles.viewScoreButtonText}>重新录制</ThemedText>
                </Pressable>
              </View>
            )}
          </>
        )}
      </View>

      {/* 评分结果弹窗 */}
      <Modal
        visible={showScoreModal}
        transparent={true}
        animationType="fade"
        onRequestClose={closeScoreModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            {scoringResult && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* 关闭按钮 */}
                <Pressable 
                  style={styles.modalCloseButton}
                  onPress={closeScoreModal}
                >
                  <IconSymbol name="xmark" size={20} color={colors.textSecondary} />
                </Pressable>

                {/* 总分区域 */}
                <View style={styles.modalScoreHeader}>
                  <ThemedText style={[styles.modalScoreLabel, { color: colors.textSecondary }]}>
                    总分
                  </ThemedText>
                  <ThemedText style={[styles.modalScoreNumber, { color: getScoreColor(scoringResult.overallScore ?? 0) }]}>
                    {Math.round(scoringResult.overallScore ?? 0)}
                  </ThemedText>
                  <ThemedText style={[styles.modalFeedback, { color: colors.text }]}>
                    {getScoreFeedback(scoringResult.overallScore ?? 0)}
                  </ThemedText>
                </View>

                {/* 单词评分 */}
                <View style={styles.modalWordScores}>
                  <ThemedText style={[styles.modalWordScoresTitle, { color: colors.textSecondary }]}>
                    单词评分：
                  </ThemedText>
                  <View style={styles.modalWordScoresList}>
                    {scoringResult.wordScores.map((wordScore, index) => (
                      <View key={index} style={[styles.modalWordScoreItem, { backgroundColor: colors.backgroundSecondary }]}>
                        <ThemedText style={[styles.modalWordText, { color: colors.text }]}>
                          {wordScore.word}
                        </ThemedText>
                        <ThemedText style={[styles.modalWordScoreValue, { color: getScoreColor(wordScore.score) }]}>
                          {wordScore.score}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                </View>

                {/* 操作按钮 */}
                <View style={styles.modalActions}>
                  <Pressable 
                    style={[styles.modalButton, { backgroundColor: colors.primary }]}
                    onPress={resetRecording}
                  >
                    <ThemedText style={styles.modalButtonText}>再练一次</ThemedText>
                  </Pressable>
                  <Pressable 
                    style={[styles.modalButton, { backgroundColor: colors.success }]}
                    onPress={handleBackFromScore}
                  >
                    <ThemedText style={styles.modalButtonText}>返回列表</ThemedText>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* 视频配音录制完成确认弹窗 */}
      <Modal
        visible={showVideoDubbingConfirm}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowVideoDubbingConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.videoDubbingConfirmModal, { backgroundColor: colors.card }]}>
            <View style={styles.videoDubbingConfirmIcon}>
              <IconSymbol name="checkmark.circle.fill" size={56} color={colors.success} />
            </View>
            <ThemedText style={[styles.videoDubbingConfirmTitle, { color: colors.text }]}>
              录制完成
            </ThemedText>
            <ThemedText style={[styles.videoDubbingConfirmDesc, { color: colors.textSecondary }]}>
              是否上传并合成视频？
            </ThemedText>
            <ThemedText style={[styles.videoDubbingConfirmSubDesc, { color: colors.textSecondary }]}>
              合成后将生成上下拼接的竖版视频
            </ThemedText>
            
            <View style={styles.videoDubbingConfirmButtons}>
              <Pressable 
                style={[styles.videoDubbingConfirmBtn, styles.videoDubbingConfirmBtnSecondary, { borderColor: colors.cardBorder }]}
                onPress={resetVideoDubbing}
              >
                <IconSymbol name="arrow.counterclockwise" size={20} color={colors.warning} />
                <ThemedText style={[styles.videoDubbingConfirmBtnText, { color: colors.text }]}>重新录制</ThemedText>
              </Pressable>
              <Pressable 
                style={[styles.videoDubbingConfirmBtn, styles.videoDubbingConfirmBtnPrimary, { backgroundColor: colors.success }]}
                onPress={() => {
                  setShowVideoDubbingConfirm(false);
                  submitVideoDubbing();
                }}
              >
                <IconSymbol name="arrow.up.circle.fill" size={20} color="#FFFFFF" />
                <ThemedText style={[styles.videoDubbingConfirmBtnText, { color: '#FFFFFF' }]}>上传合成</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 合成完成弹窗 */}
      <Modal
        visible={showCompositeModal}
        transparent={true}
        animationType="fade"
        onRequestClose={closeCompositeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* 关闭按钮 */}
              <Pressable 
                style={styles.modalCloseButton}
                onPress={closeCompositeModal}
              >
                <IconSymbol name="xmark" size={20} color={colors.textSecondary} />
              </Pressable>

              {/* 成功图标 */}
              <View style={styles.compositeSuccessHeader}>
                <View style={[styles.successIconContainer, { backgroundColor: colors.success + '20' }]}>
                  <IconSymbol name="checkmark.circle.fill" size={48} color={colors.success} />
                </View>
                <ThemedText style={[styles.compositeSuccessTitle, { color: colors.text }]}>
                  配音合成完成！
                </ThemedText>
                <ThemedText style={[styles.compositeSuccessSubtitle, { color: colors.textSecondary }]}>
                  你的配音已经成功合成到视频中
                </ThemedText>
              </View>

              {/* 预览视频 */}
              {compositeVideoPath && (
                <View style={styles.compositePreview}>
                  <VideoPlayer
                    uri={getStreamingVideoUrl(compositeVideoPath)}
                    style={styles.compositeVideo}
                    autoPlay={true}
                  />
                </View>
              )}

              {/* 下载按钮 */}
              <Pressable 
                style={[styles.downloadButton, { backgroundColor: colors.success }]}
                onPress={handleDownloadVideo}
                disabled={downloading}
              >
                {downloading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <IconSymbol name="arrow.down.circle.fill" size={20} color="#FFFFFF" />
                )}
                <ThemedText style={styles.downloadButtonText}>
                  {downloading ? '下载中...' : '下载到相册'}
                </ThemedText>
              </Pressable>

              {/* 操作按钮 */}
              <View style={styles.modalActions}>
                <Pressable 
                  style={[styles.modalButton, { backgroundColor: colors.backgroundSecondary }]}
                  onPress={async () => {
                    await closeCompositeModal();
                    resetComposite();
                  }}
                >
                  <ThemedText style={[styles.modalButtonText, { color: colors.text }]}>再录一次</ThemedText>
                </Pressable>
                <Pressable 
                  style={[styles.modalButton, { backgroundColor: colors.primary }]}
                  onPress={async () => {
                    await closeCompositeModal();
                    router.back();
                  }}
                >
                  <ThemedText style={styles.modalButtonText}>返回列表</ThemedText>
                </Pressable>
              </View>

              <ThemedText style={[styles.compositeHint, { color: colors.textSecondary }]}>
                你也可以在"我的配音"中查看和管理所有录制的配音
              </ThemedText>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 评分历史列表弹窗 */}
      <Modal
        visible={showHistoryModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowHistoryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* 关闭按钮 */}
              <Pressable 
                style={styles.modalCloseButton}
                onPress={() => setShowHistoryModal(false)}
              >
                <IconSymbol name="xmark" size={20} color={colors.textSecondary} />
              </Pressable>

              {/* 标题 */}
              <View style={styles.historyModalHeader}>
                <IconSymbol name="clock.arrow.circlepath" size={24} color={colors.primary} />
                <ThemedText style={[styles.historyModalTitle, { color: colors.text }]}>
                  评分历史
                </ThemedText>
              </View>

              {/* 历史记录列表 */}
              <View style={styles.historyList}>
                {scoreHistory.map((record, index) => (
                  <Pressable
                    key={record.id}
                    style={[styles.historyItem, { backgroundColor: colors.backgroundSecondary }]}
                    onPress={() => handleViewHistoryDetail(record)}
                  >
                    <View style={styles.historyItemLeft}>
                      <View style={[styles.historyRank, { backgroundColor: colors.primary + '20' }]}>
                        <ThemedText style={[styles.historyRankText, { color: colors.primary }]}>
                          #{index + 1}
                        </ThemedText>
                      </View>
                      <View style={styles.historyItemInfo}>
                        <ThemedText style={[styles.historyDate, { color: colors.textSecondary }]}>
                          {formatDateTime(record.createdAt)}
                        </ThemedText>
                        <ThemedText style={[styles.historyFeedback, { color: colors.text }]} numberOfLines={1}>
                          {record.feedback || '点击查看详情'}
                        </ThemedText>
                      </View>
                    </View>
                    <View style={styles.historyItemRight}>
                      <ThemedText style={[styles.historyScore, { color: getScoreColor(record.score ?? 0) }]}>
                        {record.score ?? '--'}
                      </ThemedText>
                      <IconSymbol name="chevron.right" size={16} color={colors.textSecondary} />
                    </View>
                  </Pressable>
                ))}
              </View>

              {/* 关闭按钮 */}
              <Pressable 
                style={[styles.historyCloseBtn, { backgroundColor: colors.backgroundSecondary }]}
                onPress={() => setShowHistoryModal(false)}
              >
                <ThemedText style={[styles.historyCloseBtnText, { color: colors.text }]}>关闭</ThemedText>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 历史记录详情弹窗 */}
      <Modal
        visible={showHistoryDetailModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseHistoryDetail}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            {selectedHistoryRecord && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* 关闭按钮 */}
                <Pressable 
                  style={styles.modalCloseButton}
                  onPress={handleCloseHistoryDetail}
                >
                  <IconSymbol name="xmark" size={20} color={colors.textSecondary} />
                </Pressable>

                {/* 时间标签 */}
                <View style={styles.historyDetailTime}>
                  <ThemedText style={[styles.historyDetailTimeText, { color: colors.textSecondary }]}>
                    {formatDateTime(selectedHistoryRecord.createdAt)}
                  </ThemedText>
                </View>

                {/* 总分区域 */}
                <View style={styles.modalScoreHeader}>
                  <ThemedText style={[styles.modalScoreLabel, { color: colors.textSecondary }]}>
                    总分
                  </ThemedText>
                  <ThemedText style={[styles.modalScoreNumber, { color: getScoreColor(selectedHistoryRecord.score ?? 0) }]}>
                    {selectedHistoryRecord.score ?? '--'}
                  </ThemedText>
                  <ThemedText style={[styles.modalFeedback, { color: colors.text }]}>
                    {getScoreFeedback(selectedHistoryRecord.score ?? 0)}
                  </ThemedText>
                </View>

                {/* 单词评分 */}
                {selectedHistoryRecord.wordScores && selectedHistoryRecord.wordScores.length > 0 && (
                  <View style={styles.modalWordScores}>
                    <ThemedText style={[styles.modalWordScoresTitle, { color: colors.textSecondary }]}>
                      单词评分：
                    </ThemedText>
                    <View style={styles.modalWordScoresList}>
                      {selectedHistoryRecord.wordScores.map((wordScore, index) => (
                        <View key={index} style={[styles.modalWordScoreItem, { backgroundColor: colors.backgroundSecondary }]}>
                          <ThemedText style={[styles.modalWordText, { color: colors.text }]}>
                            {wordScore.word}
                          </ThemedText>
                          <ThemedText style={[styles.modalWordScoreValue, { color: getScoreColor(wordScore.score) }]}>
                            {wordScore.score}
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* 返回按钮 */}
                <View style={styles.modalActions}>
                  <Pressable 
                    style={[styles.modalButton, { backgroundColor: colors.backgroundSecondary, flex: 1 }]}
                    onPress={() => {
                      setShowHistoryDetailModal(false);
                      setShowHistoryModal(true);
                    }}
                  >
                    <ThemedText style={[styles.modalButtonText, { color: colors.text }]}>返回列表</ThemedText>
                  </Pressable>
                  <Pressable 
                    style={[styles.modalButton, { backgroundColor: colors.primary, flex: 1 }]}
                    onPress={handleCloseHistoryDetail}
                  >
                    <ThemedText style={styles.modalButtonText}>关闭</ThemedText>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* 字典弹窗 */}
      <Modal
        visible={showDictModal}
        transparent={true}
        animationType="fade"
        onRequestClose={closeDictModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.dictModalContent, { backgroundColor: colors.card }]}>
            {/* 右上角关闭按钮 */}
            <Pressable 
              style={[styles.dictCloseBtnCorner, { backgroundColor: colors.backgroundSecondary }]}
              onPress={closeDictModal}
            >
              <IconSymbol name="xmark" size={16} color={colors.textSecondary} />
            </Pressable>

            {/* 固定头部 - 单词 */}
            <View style={styles.dictFixedHeader}>
              <View style={styles.dictTitleCenter}>
                <ThemedText style={[styles.dictWord, { color: colors.text }]}>
                  {dictWord}
                </ThemedText>
                {dictData?.phonetic && (
                  <ThemedText style={[styles.dictPhonetic, { color: colors.textSecondary }]}>
                    {dictData.phonetic}
                  </ThemedText>
                )}
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>

              {/* 加载状态 */}
              {dictLoading && (
                <View style={styles.dictLoadingContainer}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <ThemedText style={[styles.dictLoadingText, { color: colors.textSecondary }]}>
                    正在查询...
                  </ThemedText>
                </View>
              )}

              {/* 错误状态 */}
              {dictError && !dictLoading && (
                <View style={styles.dictErrorContainer}>
                  <ThemedText style={[styles.dictErrorText, { color: colors.error }]}>
                    {dictError}
                  </ThemedText>
                  <Pressable 
                    style={[styles.dictRetryButton, { backgroundColor: colors.primary }]}
                    onPress={() => lookupWord(dictWord)}
                  >
                    <ThemedText style={styles.dictRetryText}>重试</ThemedText>
                  </Pressable>
                </View>
              )}

              {/* 字典内容 */}
              {dictData && !dictLoading && (
                <View style={styles.dictContent}>
                  {/* 释义 */}
                  {dictData.definitions && dictData.definitions.length > 0 && (
                    <View style={styles.dictSection}>
                      <ThemedText style={[styles.dictSectionTitle, { color: colors.primary }]}>
                        释义
                      </ThemedText>
                      {dictData.definitions.map((def, idx) => {
                        const pos = def.partOfSpeech || def.pos || '';
                        const meaning = def.definition || def.meaning || '';
                        const meaningCN = def.definitionCN || def.meaning_cn || '';
                        return (
                          <View key={idx} style={styles.dictDefinitionItem}>
                            {pos ? (
                              <View style={[styles.dictPosTag, { backgroundColor: colors.primary + '20' }]}>
                                <ThemedText style={[styles.dictPosText, { color: colors.primary }]}>
                                  {pos}
                                </ThemedText>
                              </View>
                            ) : null}
                            {meaning ? (
                              <ThemedText style={[styles.dictDefinition, { color: colors.text }]}>
                                {meaning}
                              </ThemedText>
                            ) : null}
                            {meaningCN ? (
                              <ThemedText style={[styles.dictDefinitionCN, { color: colors.textSecondary }]}>
                                {meaningCN}
                              </ThemedText>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* 例句 */}
                  {dictData.examples && dictData.examples.length > 0 && (
                    <View style={styles.dictSection}>
                      <ThemedText style={[styles.dictSectionTitle, { color: colors.primary }]}>
                        例句
                      </ThemedText>
                      {dictData.examples.slice(0, 3).map((example, idx) => (
                        <View key={idx} style={styles.dictExampleItem}>
                          <ThemedText style={[styles.dictExample, { color: colors.text }]}>
                            • {example.sentence}
                          </ThemedText>
                          {example.translation && (
                            <ThemedText style={[styles.dictExampleTranslation, { color: colors.textSecondary }]}>
                              {example.translation}
                            </ThemedText>
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                  {/* 搭配 */}
                  {dictData.collocations && dictData.collocations.length > 0 && (
                    <View style={styles.dictSection}>
                      <ThemedText style={[styles.dictSectionTitle, { color: colors.primary }]}>
                        常见搭配
                      </ThemedText>
                      <View style={styles.dictCollocations}>
                        {dictData.collocations.slice(0, 6).map((collocation, idx) => (
                          <View key={idx} style={[styles.dictCollocationTag, { backgroundColor: colors.backgroundSecondary }]}>
                            <ThemedText style={[styles.dictCollocationText, { color: colors.text }]}>
                              {collocation.phrase}
                            </ThemedText>
                            {collocation.translation && (
                              <ThemedText style={[styles.dictCollocationTranslation, { color: colors.textSecondary }]}>
                                {collocation.translation}
                              </ThemedText>
                            )}
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* 词源 */}
                  {dictData.etymology && (
                    <View style={styles.dictSection}>
                      <ThemedText style={[styles.dictSectionTitle, { color: colors.primary }]}>
                        词源
                      </ThemedText>
                      <ThemedText style={[styles.dictEtymology, { color: colors.textSecondary }]}>
                        {dictData.etymology}
                      </ThemedText>
                    </View>
                  )}
                </View>
              )}

              {/* 关闭按钮 */}
              <Pressable 
                style={[styles.dictCloseBtn, { backgroundColor: colors.backgroundSecondary }]}
                onPress={closeDictModal}
              >
                <ThemedText style={[styles.dictCloseBtnText, { color: colors.text }]}>关闭</ThemedText>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    width: 40,
  },
  videoSection: {
    width: width,
    height: width * 0.56,
    backgroundColor: '#000',
    position: 'relative',
  },
  videoSectionSmall: {
    height: width * 0.45, // 视频配音模式下视频区域稍小
  },
  videoTouchArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  playButtonOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.9,
  },
  // 视频配音模式下的文字覆盖层
  videoTextOverlay: {
    position: 'absolute',
    bottom: 40,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  videoOverlayText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
  },
  videoOverlayTranslation: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  timeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    minWidth: 40,
    textAlign: 'center',
  },
  progressBarContainer: {
    flex: 1,
    marginHorizontal: 12,
    height: 24,
    justifyContent: 'center',
  },
  progressBarBackground: {
    height: 4,
    borderRadius: 2,
    position: 'relative',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressThumb: {
    position: 'absolute',
    top: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
  },
  textSection: {
    margin: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
  },
  textSectionFixed: {
    height: height / 6,  // 固定为屏幕高度的 1/6
    marginTop: 8,
    marginBottom: 8,
  },
  textScrollView: {
    flex: 1,
  },
  textScrollContent: {
    paddingBottom: 8,
  },
  historyBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 12,
    gap: 6,
  },
  clipMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  durationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  durationText: {
    fontSize: 12,
    fontWeight: '500',
  },
  historyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  historyBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  originalTextContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 8,
  },
  quoteText: {
    fontSize: 20,
    fontWeight: '600',
  },
  wordsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  wordButton: {
    paddingHorizontal: 2,
    paddingVertical: 2,
    borderRadius: 4,
  },
  wordButtonPressed: {
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  wordText: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 28,
  },
  translationText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  dictHint: {
    fontSize: 11,
    marginTop: 4,
  },
  controlSection: {
    flex: 1,
    padding: 16,
  },
  controls: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    fontSize: 14,
    marginBottom: 20,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  recordingButtonStyle: {
    transform: [{ scale: 1.1 }],
  },
  recordHint: {
    marginTop: 12,
    fontSize: 12,
  },
  recordingProgressContainer: {
    width: '100%',
    paddingHorizontal: 40,
    marginVertical: 20,
  },
  recordingProgressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  recordingProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  recordingProgressText: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  recordingText: {
    fontSize: 16,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    borderWidth: 2,
    minWidth: 80,
  },
  submitButton: {
    borderWidth: 0,
  },
  actionButtonText: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
  },
  uploadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  viewScoreButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
  },
  scoredButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  viewScoreButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  modalCloseButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    padding: 8,
    zIndex: 10,
  },
  modalScoreHeader: {
    alignItems: 'center',
    marginBottom: 24,
    paddingTop: 8,
  },
  modalScoreLabel: {
    fontSize: 16,
    marginBottom: 8,
  },
  modalScoreNumber: {
    fontSize: 80,
    fontWeight: 'bold',
    lineHeight: 88,
  },
  modalFeedback: {
    fontSize: 22,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  modalWordScores: {
    marginBottom: 24,
  },
  modalWordScoresTitle: {
    fontSize: 14,
    marginBottom: 12,
  },
  modalWordScoresList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  modalWordScoreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    gap: 8,
  },
  modalWordText: {
    fontSize: 15,
  },
  modalWordScoreValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // History modal styles
  historyModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
    paddingTop: 8,
  },
  historyModalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  historyList: {
    gap: 12,
    marginBottom: 20,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
  },
  historyItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  historyRank: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyRankText: {
    fontSize: 12,
    fontWeight: '600',
  },
  historyItemInfo: {
    flex: 1,
  },
  historyDate: {
    fontSize: 12,
    marginBottom: 2,
  },
  historyFeedback: {
    fontSize: 14,
  },
  historyItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyScore: {
    fontSize: 24,
    fontWeight: '700',
  },
  historyCloseBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  historyCloseBtnText: {
    fontSize: 16,
    fontWeight: '500',
  },
  historyDetailTime: {
    alignItems: 'center',
    marginBottom: 8,
    paddingTop: 8,
  },
  historyDetailTimeText: {
    fontSize: 14,
  },
  // Dictionary modal styles
  dictModalContent: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    borderRadius: 24,
    padding: 24,
    paddingTop: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  dictCloseBtnCorner: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  dictFixedHeader: {
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  dictTitleCenter: {
    alignItems: 'center',
  },
  dictWord: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 4,
    lineHeight: 44,
  },
  dictPhonetic: {
    fontSize: 18,
  },
  dictLoadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  dictLoadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  dictErrorContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  dictErrorText: {
    fontSize: 14,
    marginBottom: 16,
  },
  dictRetryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  dictRetryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  dictContent: {
    marginBottom: 16,
  },
  dictSection: {
    marginBottom: 20,
  },
  dictSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  dictDefinitionItem: {
    marginBottom: 12,
  },
  dictPosTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
  },
  dictPosText: {
    fontSize: 12,
    fontWeight: '500',
  },
  dictDefinition: {
    fontSize: 15,
    lineHeight: 22,
  },
  dictDefinitionCN: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },
  dictExampleItem: {
    marginBottom: 10,
  },
  dictExample: {
    fontSize: 14,
    lineHeight: 22,
  },
  dictExampleTranslation: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: 2,
    marginLeft: 12,
  },
  dictCollocations: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dictCollocationTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  dictCollocationText: {
    fontSize: 13,
  },
  dictCollocationTranslation: {
    fontSize: 11,
    marginTop: 2,
  },
  dictEtymology: {
    fontSize: 13,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  dictCloseBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  dictCloseBtnText: {
    fontSize: 16,
    fontWeight: '500',
  },
  // 模式切换样式
  modeTabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
    borderBottomWidth: 1,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  modeTabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // 合成相关样式
  errorHint: {
    marginTop: 12,
    fontSize: 12,
    textAlign: 'center',
  },
  processingHint: {
    marginTop: 8,
    fontSize: 12,
    textAlign: 'center',
  },
  vocalRemovedHint: {
    marginTop: 12,
    fontSize: 12,
    textAlign: 'center',
  },
  // 视频配音样式
  cameraPreviewContainer: {
    width: '100%',
    aspectRatio: 1, // 正方形
    marginBottom: 8,
  },
  cameraPreviewWrapper: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  cameraPreview: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraOverlayText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginTop: 8,
  },
  cameraRecordingBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    gap: 6,
  },
  recordingDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  cameraRecordingText: {
    color: '#FF3B30',
    fontSize: 12,
    fontWeight: '700',
  },
  cameraPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraPlaceholderText: {
    marginTop: 8,
    fontSize: 14,
  },
  permissionButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  videoDubbingControls: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  videoDubbingControlsCompact: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  recordingTimeText: {
    fontSize: 15,
    fontWeight: '600',
  },
  videoDubbingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 30,
    gap: 10,
  },
  videoDubbingButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // 视频配音确认对话框样式
  videoDubbingConfirmModal: {
    width: '85%',
    maxWidth: 340,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  videoDubbingConfirmIcon: {
    marginBottom: 16,
  },
  videoDubbingConfirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  videoDubbingConfirmDesc: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 4,
  },
  videoDubbingConfirmSubDesc: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
  },
  videoDubbingConfirmButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  videoDubbingConfirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  videoDubbingConfirmBtnSecondary: {
    borderWidth: 1,
  },
  videoDubbingConfirmBtnPrimary: {
  },
  videoDubbingConfirmBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  videoDubbingHint: {
    marginTop: 8,
    fontSize: 13,
    textAlign: 'center',
  },
  compositeSuccessHeader: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 24,
  },
  successIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  compositeSuccessTitle: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
  },
  compositeSuccessSubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  compositePreview: {
    marginBottom: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },
  compositeVideo: {
    width: '100%',
    height: 200,
    backgroundColor: '#000',
  },
  compositeHint: {
    marginTop: 16,
    fontSize: 12,
    textAlign: 'center',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
  },
  downloadButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
