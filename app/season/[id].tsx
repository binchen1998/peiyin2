import { Image } from 'expo-image';
import { StyleSheet, ScrollView, View, Pressable, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getEpisodes } from '@/data/mock-data';
import { IconSymbol } from '@/components/ui/icon-symbol';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 32;

export default function SeasonDetailScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const router = useRouter();
  const { id, cartoonName } = useLocalSearchParams<{ id: string; cartoonName: string }>();

  const episodes = getEpisodes(id);

  // 从季节ID中提取季数
  const seasonNumber = id.split('-').pop()?.replace('s', '') || '1';

  const handleEpisodePress = (episodeId: string, episodeTitle: string) => {
    router.push(`/episode/${episodeId}?title=${encodeURIComponent(episodeTitle)}`);
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
            {decodeURIComponent(cartoonName || '')} · 第{seasonNumber}季
          </ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            共 {episodes.length} 集
          </ThemedText>
        </View>
      </View>

      {/* 集数列表 */}
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

        <View style={styles.episodeList}>
          {episodes.map((episode, index) => (
            <Pressable
              key={episode.id}
              style={({ pressed }) => [
                styles.episodeCard,
                { 
                  backgroundColor: colors.card,
                  borderColor: colors.cardBorder,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
              onPress={() => handleEpisodePress(episode.id, episode.titleCN)}
            >
              <View style={styles.episodeImageContainer}>
                <Image
                  source={{ uri: episode.thumbnail }}
                  style={styles.episodeImage}
                  contentFit="cover"
                  transition={300}
                />
                <View style={[styles.episodeBadge, { backgroundColor: getEpisodeColor(index) }]}>
                  <ThemedText style={styles.episodeBadgeText}>
                    E{episode.number}
                  </ThemedText>
                </View>
              </View>
              <View style={styles.episodeInfo}>
                <ThemedText style={[styles.episodeTitle, { color: colors.text }]} numberOfLines={1}>
                  {episode.titleCN}
                </ThemedText>
                <ThemedText style={[styles.episodeSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                  {episode.title}
                </ThemedText>
                <View style={styles.episodeMeta}>
                  <View style={[styles.metaTag, { backgroundColor: colors.backgroundSecondary }]}>
                    <ThemedText style={[styles.metaText, { color: colors.primary }]}>
                      🎤 可配音
                    </ThemedText>
                  </View>
                </View>
              </View>
              <View style={styles.episodeArrow}>
                <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
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
  episodeList: {
    gap: 12,
  },
  episodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  episodeImageContainer: {
    position: 'relative',
  },
  episodeImage: {
    width: 100,
    height: 70,
  },
  episodeBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  episodeBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  episodeInfo: {
    flex: 1,
    padding: 12,
  },
  episodeTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  episodeSubtitle: {
    fontSize: 12,
    marginBottom: 8,
  },
  episodeMeta: {
    flexDirection: 'row',
  },
  metaTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  metaText: {
    fontSize: 11,
    fontWeight: '500',
  },
  episodeArrow: {
    padding: 12,
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
