import { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Pressable, Dimensions, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Audio } from 'expo-av';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, getScoreColor, getScoreFeedback } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getDubbingClip } from '@/data/mock-data';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ScoringResult } from '@/types';
import { API_BASE_URL } from '@/config/api';

const { width } = Dimensions.get('window');

type RecordingStatus = 'idle' | 'recording' | 'recorded' | 'uploading' | 'scored';

export default function DubbingScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const clip = getDubbingClip(id);
  
  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [scoringResult, setScoringResult] = useState<ScoringResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 请求麦克风权限
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setError('需要麦克风权限才能录音');
      }
      
      // 配置音频模式
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
    })();

    return () => {
      // 清理录音
      if (recording) {
        recording.stopAndUnloadAsync();
      }
    };
  }, []);

  if (!clip) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
        <ThemedText>配音片段不存在</ThemedText>
      </ThemedView>
    );
  }

  const handleBack = () => {
    router.back();
  };

  const handlePlayVideo = async () => {
    if (videoRef.current) {
      if (isPlaying) {
        await videoRef.current.pauseAsync();
      } else {
        await videoRef.current.replayAsync();
      }
    }
  };

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setIsPlaying(status.isPlaying);
      if (status.didJustFinish) {
        setIsPlaying(false);
      }
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
      
      // 停止视频播放
      if (videoRef.current) {
        await videoRef.current.pauseAsync();
      }

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecording(newRecording);
      setRecordingStatus('recording');
    } catch (err) {
      console.error('开始录音失败:', err);
      setError('开始录音失败，请重试');
    }
  };

  const stopRecording = async () => {
    try {
      if (!recording) return;

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      
      setRecording(null);
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
      const { sound } = await Audio.Sound.createAsync({ uri: recordingUri });
      await sound.playAsync();
    } catch (err) {
      console.error('播放录音失败:', err);
      setError('播放录音失败');
    }
  };

  const submitRecording = async () => {
    if (!recordingUri) return;

    setRecordingStatus('uploading');
    setError(null);

    try {
      const formData = new FormData();
      
      // 添加音频文件
      const audioFile = {
        uri: recordingUri,
        type: 'audio/m4a',
        name: 'recording.m4a',
      } as any;
      formData.append('audio', audioFile);
      formData.append('text', clip.originalText);
      formData.append('clip_id', clip.id);

      const response = await fetch(`${API_BASE_URL}/api/score`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!response.ok) {
        throw new Error('评分请求失败');
      }

      const result: ScoringResult = await response.json();
      setScoringResult(result);
      setRecordingStatus('scored');
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
    }
  };

  const resetRecording = () => {
    setRecordingUri(null);
    setScoringResult(null);
    setRecordingStatus('idle');
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 顶部导航 */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.cardBorder }]}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <IconSymbol name="chevron.left" size={24} color={colors.primary} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: colors.text }]}>配音练习</ThemedText>
        <View style={styles.placeholder} />
      </View>

      {/* 视频播放区域 */}
      <View style={styles.videoSection}>
        <Video
          ref={videoRef}
          source={{ uri: clip.videoUrl }}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
          useNativeControls={false}
        />
        <Pressable 
          style={[styles.playButton, { backgroundColor: colors.primary }]}
          onPress={handlePlayVideo}
        >
          <IconSymbol 
            name={isPlaying ? "pause.fill" : "play.fill"} 
            size={32} 
            color="#FFFFFF" 
          />
        </Pressable>
      </View>

      {/* 台词显示区域 */}
      <View style={[styles.textSection, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={styles.characterInfo}>
          <View style={[styles.characterBadge, { backgroundColor: colors.primary }]}>
            <ThemedText style={styles.characterEmoji}>👤</ThemedText>
          </View>
          <ThemedText style={[styles.characterName, { color: colors.primary }]}>
            {clip.character}
          </ThemedText>
        </View>
        <ThemedText style={[styles.originalText, { color: colors.text }]}>
          "{clip.originalText}"
        </ThemedText>
        <ThemedText style={[styles.translationText, { color: colors.textSecondary }]}>
          {clip.translationCN}
        </ThemedText>
      </View>

      {/* 录音控制区域 */}
      <View style={styles.controlSection}>
        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.error + '20' }]}>
            <ThemedText style={[styles.errorText, { color: colors.error }]}>
              ⚠️ {error}
            </ThemedText>
          </View>
        )}

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
              style={[styles.recordButton, styles.recordingButton, { backgroundColor: colors.error }]}
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
              录音完成！
            </ThemedText>
            <View style={styles.actionButtons}>
              <Pressable 
                style={[styles.actionButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.cardBorder }]}
                onPress={playRecording}
              >
                <IconSymbol name="play.fill" size={24} color={colors.primary} />
                <ThemedText style={[styles.actionButtonText, { color: colors.text }]}>试听</ThemedText>
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

        {recordingStatus === 'scored' && scoringResult && (
          <View style={styles.scoreSection}>
            <View style={[styles.scoreCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.scoreHeader}>
                <ThemedText style={styles.scoreEmoji}>
                  {scoringResult.overallScore >= 90 ? '🌟' : 
                   scoringResult.overallScore >= 70 ? '👍' : 
                   scoringResult.overallScore >= 50 ? '💪' : '🎯'}
                </ThemedText>
                <View style={styles.scoreInfo}>
                  <ThemedText style={[styles.scoreLabel, { color: colors.textSecondary }]}>
                    总分
                  </ThemedText>
                  <ThemedText style={[styles.scoreValue, { color: getScoreColor(scoringResult.overallScore) }]}>
                    {scoringResult.overallScore}
                  </ThemedText>
                </View>
              </View>
              
              <ThemedText style={[styles.scoreFeedback, { color: colors.text }]}>
                {getScoreFeedback(scoringResult.overallScore)}
              </ThemedText>

              {/* 单词评分 */}
              <View style={styles.wordScores}>
                <ThemedText style={[styles.wordScoresTitle, { color: colors.textSecondary }]}>
                  单词评分：
                </ThemedText>
                <View style={styles.wordScoresList}>
                  {scoringResult.wordScores.map((wordScore, index) => (
                    <View key={index} style={[styles.wordScoreItem, { backgroundColor: colors.backgroundSecondary }]}>
                      <ThemedText style={[styles.wordText, { color: colors.text }]}>
                        {wordScore.word}
                      </ThemedText>
                      <ThemedText style={[styles.wordScoreValue, { color: getScoreColor(wordScore.score) }]}>
                        {wordScore.score}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.scoreActions}>
                <Pressable 
                  style={[styles.scoreButton, { backgroundColor: colors.primary }]}
                  onPress={resetRecording}
                >
                  <ThemedText style={styles.scoreButtonText}>再练一次</ThemedText>
                </Pressable>
                <Pressable 
                  style={[styles.scoreButton, styles.nextButton, { backgroundColor: colors.success }]}
                  onPress={handleBack}
                >
                  <ThemedText style={styles.scoreButtonText}>返回列表</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  playButton: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.9,
  },
  textSection: {
    margin: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
  },
  characterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  characterBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  characterEmoji: {
    fontSize: 16,
  },
  characterName: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  originalText: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 28,
    marginBottom: 8,
  },
  translationText: {
    fontSize: 14,
    lineHeight: 20,
  },
  controlSection: {
    flex: 1,
    padding: 16,
  },
  errorBox: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
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
  recordingButton: {
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
  scoreSection: {
    flex: 1,
  },
  scoreCard: {
    borderRadius: 20,
    borderWidth: 2,
    padding: 20,
  },
  scoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreEmoji: {
    fontSize: 48,
  },
  scoreInfo: {
    marginLeft: 16,
  },
  scoreLabel: {
    fontSize: 14,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  scoreFeedback: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  wordScores: {
    marginBottom: 20,
  },
  wordScoresTitle: {
    fontSize: 14,
    marginBottom: 8,
  },
  wordScoresList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  wordScoreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  wordText: {
    fontSize: 14,
  },
  wordScoreValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  scoreActions: {
    flexDirection: 'row',
    gap: 12,
  },
  scoreButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  nextButton: {},
  scoreButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
