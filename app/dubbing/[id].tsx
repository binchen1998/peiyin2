import { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Pressable, Dimensions, ActivityIndicator, Platform, Modal, ScrollView, PanResponder, GestureResponderEvent } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Audio } from 'expo-av';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, getScoreColor, getScoreFeedback } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { fetchClipByPath } from '@/data/mock-data';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ScoringResult, DubbingClip, WordScore } from '@/types';
import { API_BASE_URL, API_ENDPOINTS, VOSK_SERVICE_URL } from '@/config/api';
import { getUserId } from '@/hooks/use-user-profile';

const { width } = Dimensions.get('window');

type RecordingStatus = 'idle' | 'recording' | 'recorded' | 'uploading' | 'scored';

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
        setScoreHistory(data);
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

  const startRecording = async () => {
    try {
      setError(null);
      
      // 停止视频播放
      if (videoRef.current) {
        await videoRef.current.pauseAsync();
      }

      // 确保音频模式正确
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      recordingRef.current = newRecording;
      setRecordingStatus('recording');
    } catch (err) {
      console.error('开始录音失败:', err);
      setError('开始录音失败，请重试');
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
    } catch (err) {
      console.error('停止录音失败:', err);
      setError('停止录音失败，请重试');
      setRecordingStatus('idle');
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

      const { sound } = await Audio.Sound.createAsync(
        { uri: recordingUri },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            // 播放完成
            setIsPlayingRecording(false);
            sound.unloadAsync();
            playbackSoundRef.current = null;
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
      // 关闭弹窗
      setShowScoreModal(false);
      
      // 停止播放
      if (playbackSoundRef.current) {
        await playbackSoundRef.current.stopAsync();
        await playbackSoundRef.current.unloadAsync();
        playbackSoundRef.current = null;
        setIsPlayingRecording(false);
      }
      
      setRecordingUri(null);
      setScoringResult(null);
      setRecordingStatus('idle');
      
      // 切回录音模式
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
    } catch (err) {
      console.error('重置录音失败:', err);
    }
  };

  const handleBackFromScore = () => {
    setShowScoreModal(false);
    router.back();
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
      <View style={styles.videoSection}>
        <Pressable style={styles.videoTouchArea} onPress={handleVideoPress}>
          <Video
            ref={videoRef}
            source={{ uri: clip.videoUrl }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
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
        
        {/* 进度条区域 - 仅在暂停时显示 */}
        {!isPlaying && videoDuration > 0 && (
          <View style={styles.progressContainer}>
            <ThemedText style={styles.timeText}>{formatTime(videoPosition)}</ThemedText>
            <Pressable 
              style={styles.progressBarContainer}
              onPress={handleProgressBarPress}
            >
              <View style={[styles.progressBarBackground, { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                <View 
                  style={[
                    styles.progressBarFill, 
                    { 
                      backgroundColor: colors.primary,
                      width: `${progressPercentage}%` 
                    }
                  ]} 
                />
                <View 
                  style={[
                    styles.progressThumb,
                    { 
                      backgroundColor: colors.primary,
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

      {/* 台词显示区域 */}
      <View style={[styles.textSection, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={styles.clipMeta}>
          <View style={[styles.durationBadge, { backgroundColor: colors.backgroundSecondary }]}>
            <ThemedText style={[styles.durationText, { color: colors.primary }]}>
              ⏱️ {clip.duration.toFixed(1)}秒
            </ThemedText>
          </View>
          
          {/* 评分历史按钮 */}
          {scoreHistory.length > 0 && (
            <Pressable 
              style={[styles.historyBadge, { backgroundColor: colors.primary + '20' }]}
              onPress={() => setShowHistoryModal(true)}
            >
              <IconSymbol name="clock.arrow.circlepath" size={14} color={colors.primary} />
              <ThemedText style={[styles.historyBadgeText, { color: colors.primary }]}>
                历史 ({scoreHistory.length})
              </ThemedText>
            </Pressable>
          )}
        </View>
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
      </View>

      {/* 录音控制区域 */}
      <View style={styles.controlSection}>
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
            <Pressable 
              style={[styles.viewScoreButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowScoreModal(true)}
            >
              <ThemedText style={styles.viewScoreButtonText}>查看评分结果</ThemedText>
            </Pressable>
          </View>
        )}
      </View>

      {/* 评分结果弹窗 */}
      <Modal
        visible={showScoreModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowScoreModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            {scoringResult && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* 关闭按钮 */}
                <Pressable 
                  style={styles.modalCloseButton}
                  onPress={() => setShowScoreModal(false)}
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
});
