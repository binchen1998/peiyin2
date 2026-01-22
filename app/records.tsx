import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Pressable, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, getScoreColor, getScoreFeedback } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { API_ENDPOINTS } from '@/config/api';
import { getUserId } from '@/hooks/use-user-profile';
import { WordScore } from '@/types';

// 配音记录类型
interface DubbingRecord {
  id: number;
  clipPath: string;
  seasonId: string | null;
  score: number | null;
  feedback: string | null;
  wordScores: WordScore[];
  createdAt: string;
}

export default function RecordsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const router = useRouter();

  const [records, setRecords] = useState<DubbingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<DubbingRecord | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // 加载配音记录
  const loadRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      const userId = await getUserId();
      const response = await fetch(API_ENDPOINTS.userRecords(userId));
      if (response.ok) {
        const data = await response.json();
        // 服务器可能返回 { items: [...] } 或直接数组
        const items = data.items || data;
        setRecords(Array.isArray(items) ? items : []);
      } else {
        setError('加载失败');
      }
    } catch (err) {
      console.error('加载配音记录失败:', err);
      setError('加载失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 每次页面获得焦点时刷新
  useFocusEffect(
    useCallback(() => {
      loadRecords();
    }, [])
  );

  const handleBack = () => {
    router.back();
  };

  // 格式化日期时间
  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  };

  // 从 clipPath 提取显示名称
  const getClipDisplayName = (clipPath: string) => {
    // 例如: "CE001 Muddy Puddles/clips/clip_1.mp4" -> "CE001 Muddy Puddles #1"
    const parts = clipPath.split('/');
    const episodeName = parts[0] || '';
    const clipFile = parts[parts.length - 1] || '';
    const clipMatch = clipFile.match(/clip_(\d+)/);
    const clipNum = clipMatch ? clipMatch[1] : '?';
    return `${episodeName} #${clipNum}`;
  };

  // 查看详情
  const handleViewDetail = (record: DubbingRecord) => {
    setSelectedRecord(record);
    setShowDetailModal(true);
  };

  // 重新配音
  const handleReDub = (record: DubbingRecord) => {
    if (!record.seasonId) {
      // 如果没有 seasonId，提示用户从首页进入
      return;
    }
    
    // 从 clipPath 提取 episodeName 和 index
    // clipPath 格式: "CE001 Muddy Puddles/clips/clip_1.mp4"
    const parts = record.clipPath.split('/');
    const episodeName = parts[0] || '';
    const clipFile = parts[parts.length - 1] || '';
    const clipMatch = clipFile.match(/clip_(\d+)/);
    const clipIndex = clipMatch ? parseInt(clipMatch[1]) - 1 : 0;
    
    setShowDetailModal(false);
    router.push(
      `/dubbing/${encodeURIComponent(record.clipPath)}?seasonId=${record.seasonId}&episodeName=${encodeURIComponent(episodeName)}&index=${clipIndex}`
    );
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 顶部导航 */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <IconSymbol name="chevron.left" size={24} color="#FFFFFF" />
        </Pressable>
        <View style={styles.headerContent}>
          <ThemedText style={styles.headerTitle}>所有配音记录</ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            共 {records.length} 条记录
          </ThemedText>
        </View>
      </View>

      {/* 加载状态 */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <ThemedText style={[styles.loadingText, { color: colors.textSecondary }]}>
            加载中...
          </ThemedText>
        </View>
      )}

      {/* 错误状态 */}
      {error && !loading && (
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorEmoji}>😥</ThemedText>
          <ThemedText style={[styles.errorText, { color: colors.textSecondary }]}>
            {error}
          </ThemedText>
          <Pressable 
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={loadRecords}
          >
            <ThemedText style={styles.retryButtonText}>重试</ThemedText>
          </Pressable>
        </View>
      )}

      {/* 记录列表 */}
      {!loading && !error && (
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {records.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ThemedText style={styles.emptyEmoji}>🎤</ThemedText>
              <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                还没有配音记录
              </ThemedText>
              <ThemedText style={[styles.emptyHint, { color: colors.textSecondary }]}>
                去首页选择动画片开始配音吧！
              </ThemedText>
            </View>
          ) : (
            <View style={styles.recordsList}>
              {records.map((record, index) => (
                <Pressable
                  key={record.id}
                  style={[styles.recordCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                  onPress={() => handleViewDetail(record)}
                >
                  <View style={styles.recordHeader}>
                    <View style={[styles.recordRank, { backgroundColor: colors.primary + '20' }]}>
                      <ThemedText style={[styles.recordRankText, { color: colors.primary }]}>
                        #{index + 1}
                      </ThemedText>
                    </View>
                    <View style={styles.recordInfo}>
                      <ThemedText style={[styles.recordName, { color: colors.text }]} numberOfLines={1}>
                        {getClipDisplayName(record.clipPath)}
                      </ThemedText>
                      <ThemedText style={[styles.recordDate, { color: colors.textSecondary }]}>
                        {formatDateTime(record.createdAt)}
                      </ThemedText>
                    </View>
                    <View style={styles.recordScoreContainer}>
                      <ThemedText style={[styles.recordScore, { color: getScoreColor(record.score ?? 0) }]}>
                        {record.score ?? '--'}
                      </ThemedText>
                      <ThemedText style={[styles.recordScoreLabel, { color: colors.textSecondary }]}>
                        分
                      </ThemedText>
                    </View>
                  </View>
                  
                  {record.feedback && (
                    <View style={[styles.recordFeedback, { backgroundColor: colors.backgroundSecondary }]}>
                      <ThemedText style={[styles.recordFeedbackText, { color: colors.textSecondary }]} numberOfLines={1}>
                        {record.feedback}
                      </ThemedText>
                    </View>
                  )}
                  
                  <View style={styles.recordFooter}>
                    <ThemedText style={[styles.viewDetailText, { color: colors.primary }]}>
                      查看详情
                    </ThemedText>
                    <IconSymbol name="chevron.right" size={14} color={colors.primary} />
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* 详情弹窗 */}
      <Modal
        visible={showDetailModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDetailModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            {selectedRecord && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* 顶部标题栏 - 不使用绝对定位 */}
                <View style={styles.modalTitleBar}>
                  <View style={styles.modalTitlePlaceholder} />
                  <ThemedText style={[styles.modalTitle, { color: colors.text }]}>
                    配音详情
                  </ThemedText>
                  <Pressable 
                    style={[styles.modalCloseBtn, { backgroundColor: colors.backgroundSecondary }]}
                    onPress={() => setShowDetailModal(false)}
                  >
                    <IconSymbol name="xmark" size={18} color={colors.textSecondary} />
                  </Pressable>
                </View>

                {/* 片段名称和时间 */}
                <View style={styles.detailHeader}>
                  <ThemedText style={[styles.detailClipName, { color: colors.text }]} numberOfLines={2}>
                    {getClipDisplayName(selectedRecord.clipPath)}
                  </ThemedText>
                  <ThemedText style={[styles.detailDate, { color: colors.textSecondary }]}>
                    {formatDateTime(selectedRecord.createdAt)}
                  </ThemedText>
                </View>

                {/* 总分 */}
                <View style={styles.detailScoreSection}>
                  <ThemedText style={[styles.detailScoreLabel, { color: colors.textSecondary }]}>
                    总分
                  </ThemedText>
                  <ThemedText style={[styles.detailScoreNumber, { color: getScoreColor(selectedRecord.score ?? 0) }]}>
                    {selectedRecord.score ?? '--'}
                  </ThemedText>
                  <ThemedText style={[styles.detailFeedback, { color: colors.text }]}>
                    {getScoreFeedback(selectedRecord.score ?? 0)}
                  </ThemedText>
                </View>

                {/* 单词评分 */}
                {selectedRecord.wordScores && selectedRecord.wordScores.length > 0 && (
                  <View style={styles.detailWordScores}>
                    <ThemedText style={[styles.detailSectionTitle, { color: colors.textSecondary }]}>
                      单词评分：
                    </ThemedText>
                    <View style={styles.detailWordScoresList}>
                      {selectedRecord.wordScores.map((wordScore, idx) => (
                        <View key={idx} style={[styles.detailWordScoreItem, { backgroundColor: colors.backgroundSecondary }]}>
                          <ThemedText style={[styles.detailWordText, { color: colors.text }]}>
                            {wordScore.word}
                          </ThemedText>
                          <ThemedText style={[styles.detailWordScoreValue, { color: getScoreColor(wordScore.score) }]}>
                            {wordScore.score}
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* 反馈 */}
                {selectedRecord.feedback && (
                  <View style={styles.detailFeedbackSection}>
                    <ThemedText style={[styles.detailSectionTitle, { color: colors.textSecondary }]}>
                      评价：
                    </ThemedText>
                    <ThemedText style={[styles.detailFeedbackText, { color: colors.text }]}>
                      {selectedRecord.feedback}
                    </ThemedText>
                  </View>
                )}

                {/* 操作按钮 */}
                <View style={styles.actionButtons}>
                  {selectedRecord.seasonId ? (
                    <Pressable 
                      style={[styles.reDubBtn, { backgroundColor: colors.success }]}
                      onPress={() => handleReDub(selectedRecord)}
                    >
                      <IconSymbol name="mic.fill" size={18} color="#FFFFFF" />
                      <ThemedText style={styles.reDubBtnText}>重新配音</ThemedText>
                    </Pressable>
                  ) : (
                    <View style={[styles.reDubBtnDisabled, { backgroundColor: colors.backgroundSecondary }]}>
                      <ThemedText style={[styles.reDubBtnDisabledText, { color: colors.textSecondary }]}>
                        请从首页进入配音
                      </ThemedText>
                    </View>
                  )}
                  <Pressable 
                    style={[styles.closeBtn, { backgroundColor: colors.backgroundSecondary }]}
                    onPress={() => setShowDetailModal(false)}
                  >
                    <ThemedText style={[styles.closeBtnText, { color: colors.text }]}>关闭</ThemedText>
                  </Pressable>
                </View>
              </ScrollView>
            )}
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
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerContent: {
    marginLeft: 16,
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
  },
  recordsList: {
    gap: 12,
  },
  recordCard: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 16,
  },
  recordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordRank: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordRankText: {
    fontSize: 12,
    fontWeight: '600',
  },
  recordInfo: {
    flex: 1,
    marginLeft: 12,
  },
  recordName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  recordDate: {
    fontSize: 12,
  },
  recordScoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
    minWidth: 50,
  },
  recordScore: {
    fontSize: 28,
    fontWeight: 'bold',
    lineHeight: 32,
  },
  recordScoreLabel: {
    fontSize: 10,
    marginTop: 0,
  },
  recordFeedback: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
  },
  recordFeedbackText: {
    fontSize: 13,
  },
  recordFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 12,
    gap: 4,
  },
  viewDetailText: {
    fontSize: 13,
    fontWeight: '500',
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
  modalTitleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitlePlaceholder: {
    width: 32,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  detailClipName: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  detailDate: {
    fontSize: 14,
  },
  detailScoreSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  detailScoreLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  detailScoreNumber: {
    fontSize: 72,
    fontWeight: 'bold',
    lineHeight: 80,
  },
  detailFeedback: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 8,
  },
  detailWordScores: {
    marginBottom: 20,
  },
  detailSectionTitle: {
    fontSize: 14,
    marginBottom: 10,
  },
  detailWordScoresList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailWordScoreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  detailWordText: {
    fontSize: 14,
  },
  detailWordScoreValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  detailFeedbackSection: {
    marginBottom: 20,
  },
  detailFeedbackText: {
    fontSize: 15,
    lineHeight: 22,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  reDubBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  reDubBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  reDubBtnDisabled: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  reDubBtnDisabledText: {
    fontSize: 14,
  },
  closeBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
