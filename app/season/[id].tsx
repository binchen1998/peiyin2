import { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, View, Pressable, Dimensions, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { fetchEpisodes } from '@/data/mock-data';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Episode } from '@/types';

const { width } = Dimensions.get('window');
const GRID_GAP = 10;
const NUM_COLUMNS = 2;  // 每行显示的集数
const CARD_WIDTH = (width - 32 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

export default function SeasonDetailScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const router = useRouter();
  const { id, cartoonName } = useLocalSearchParams<{ id: string; cartoonName: string }>();

  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEpisodes();
  }, [id]);

  const loadEpisodes = async () => {
    if (!id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await fetchEpisodes(id);
      setEpisodes(data);
    } catch (err) {
      console.error('加载集列表失败:', err);
      setError('加载失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleEpisodePress = (episode: Episode) => {
    // 传递 seasonId 和 episodeName
    router.push(`/episode/${encodeURIComponent(episode.name)}?seasonId=${id}&title=${encodeURIComponent(episode.titleCN || episode.title || episode.name)}`);
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 顶部标题区域 */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <IconSymbol name="chevron.left" size={24} color="#FFFFFF" />
        </Pressable>
        <View style={styles.headerContent}>
          <ThemedText style={styles.headerTitle}>
            {decodeURIComponent(cartoonName || '')}
          </ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            共 {episodes.length} 集
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
            onPress={loadEpisodes}
          >
            <ThemedText style={styles.retryButtonText}>重试</ThemedText>
          </Pressable>
        </View>
      )}

      {/* 集数列表 */}
      {!loading && !error && (
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionHeader}>
            <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
              🎬 选择集数
            </ThemedText>
          </View>

          <View style={styles.episodeGrid}>
            {episodes.map((episode, index) => (
              <Pressable
                key={`${episode.seasonId}-${episode.id}`}
                style={({ pressed }) => [
                  styles.episodeCard,
                  { 
                    backgroundColor: colors.card,
                    borderColor: colors.cardBorder,
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  },
                ]}
                onPress={() => handleEpisodePress(episode)}
              >
                {/* 集数标签 */}
                <View style={[styles.episodeBadge, { backgroundColor: getEpisodeColor(index) }]}>
                  <ThemedText style={styles.episodeBadgeText}>
                    E{episode.id + 1}
                  </ThemedText>
                </View>
                
                {/* 集标题 */}
                <ThemedText style={[styles.episodeTitle, { color: colors.text }]} numberOfLines={2}>
                  {episode.titleCN || episode.title || episode.name}
                </ThemedText>
                
                {/* 英文标题 */}
                <ThemedText style={[styles.episodeSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                  {episode.title || episode.name}
                </ThemedText>
                
                {/* 箭头指示 */}
                <View style={styles.episodeArrow}>
                  <IconSymbol name="chevron.right" size={16} color={colors.textSecondary} />
                </View>
              </Pressable>
            ))}
          </View>

          {episodes.length === 0 && (
            <View style={styles.emptyState}>
              <ThemedText style={styles.emptyEmoji}>😅</ThemedText>
              <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                暂无可用的集数
              </ThemedText>
            </View>
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const getEpisodeColor = (index: number): string => {
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
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  episodeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  episodeCard: {
    width: CARD_WIDTH,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    position: 'relative',
  },
  episodeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  episodeBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  episodeTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 4,
  },
  episodeSubtitle: {
    fontSize: 11,
    lineHeight: 14,
  },
  episodeArrow: {
    position: 'absolute',
    top: 12,
    right: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
  },
});
