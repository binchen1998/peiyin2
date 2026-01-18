import { StyleSheet, ScrollView, View, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getDubbingClips } from '@/data/mock-data';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { DubbingClip } from '@/types';

export default function EpisodeDetailScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const router = useRouter();
  const { id, title } = useLocalSearchParams<{ id: string; title: string }>();

  const clips = getDubbingClips(id);

  const handleClipPress = (clip: DubbingClip) => {
    router.push(`/dubbing/${clip.id}`);
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 顶部标题区域 */}
      <View style={[styles.header, { backgroundColor: colors.secondary }]}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <IconSymbol name="chevron.left" size={24} color="#FFFFFF" />
        </Pressable>
        <View style={styles.headerContent}>
          <ThemedText style={styles.headerTitle}>
            {decodeURIComponent(title || '')}
          </ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            共 {clips.length} 句需要配音
          </ThemedText>
        </View>
        <View style={styles.headerIcon}>
          <ThemedText style={styles.headerEmoji}>🎬</ThemedText>
        </View>
      </View>

      {/* 配音片段列表 */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHeader}>
          <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
            🎤 配音任务
          </ThemedText>
          <ThemedText style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            点击开始配音，获取评分
          </ThemedText>
        </View>

        <View style={styles.clipList}>
          {clips.map((clip, index) => (
            <Pressable
              key={clip.id}
              style={({ pressed }) => [
                styles.clipCard,
                { 
                  backgroundColor: colors.card,
                  borderColor: colors.cardBorder,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
              onPress={() => handleClipPress(clip)}
            >
              <View style={styles.clipHeader}>
                <View style={[styles.clipNumber, { backgroundColor: getClipColor(index) }]}>
                  <ThemedText style={styles.clipNumberText}>{clip.order}</ThemedText>
                </View>
                <View style={[styles.characterTag, { backgroundColor: colors.backgroundSecondary }]}>
                  <ThemedText style={[styles.characterText, { color: colors.primary }]}>
                    👤 {clip.character}
                  </ThemedText>
                </View>
              </View>
              
              <View style={styles.clipContent}>
                <ThemedText style={[styles.clipOriginal, { color: colors.text }]}>
                  "{clip.originalText}"
                </ThemedText>
                <ThemedText style={[styles.clipTranslation, { color: colors.textSecondary }]}>
                  {clip.translationCN}
                </ThemedText>
              </View>

              <View style={styles.clipFooter}>
                <View style={styles.clipDuration}>
                  <IconSymbol name="clock" size={14} color={colors.textSecondary} />
                  <ThemedText style={[styles.durationText, { color: colors.textSecondary }]}>
                    {clip.endTime - clip.startTime}秒
                  </ThemedText>
                </View>
                <View style={[styles.startButton, { backgroundColor: colors.primary }]}>
                  <ThemedText style={styles.startButtonText}>开始配音</ThemedText>
                  <IconSymbol name="play.fill" size={14} color="#FFFFFF" />
                </View>
              </View>
            </Pressable>
          ))}
        </View>

        {clips.length === 0 && (
          <View style={styles.emptyState}>
            <ThemedText style={styles.emptyEmoji}>🎬</ThemedText>
            <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
              暂无配音片段
            </ThemedText>
            <ThemedText style={[styles.emptyHint, { color: colors.textSecondary }]}>
              敬请期待更多内容
            </ThemedText>
          </View>
        )}

        {/* 学习提示 */}
        {clips.length > 0 && (
          <View style={[styles.tipCard, { backgroundColor: colors.backgroundSecondary, borderColor: colors.cardBorder }]}>
            <ThemedText style={styles.tipEmoji}>💡</ThemedText>
            <View style={styles.tipContent}>
              <ThemedText style={[styles.tipTitle, { color: colors.text }]}>
                学习小贴士
              </ThemedText>
              <ThemedText style={[styles.tipText, { color: colors.textSecondary }]}>
                先听原文，再跟着读。多练几遍，发音会越来越标准哦！
              </ThemedText>
            </View>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const getClipColor = (index: number): string => {
  const colors = ['#FF6B35', '#7C3AED', '#10B981', '#3B82F6', '#EC4899', '#F59E0B'];
  return colors[index % colors.length];
};

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
  headerIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEmoji: {
    fontSize: 24,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
  },
  clipList: {
    gap: 16,
  },
  clipCard: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  clipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  clipNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clipNumberText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  characterTag: {
    marginLeft: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  characterText: {
    fontSize: 12,
    fontWeight: '500',
  },
  clipContent: {
    marginBottom: 16,
  },
  clipOriginal: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 26,
    marginBottom: 8,
  },
  clipTranslation: {
    fontSize: 14,
    lineHeight: 20,
  },
  clipFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clipDuration: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  durationText: {
    fontSize: 12,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  startButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyState: {
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
  tipCard: {
    marginTop: 24,
    flexDirection: 'row',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  tipEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  tipText: {
    fontSize: 13,
    lineHeight: 20,
  },
});
