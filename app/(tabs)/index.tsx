import { useState, useCallback } from 'react';
import { Image } from 'expo-image';
import { 
  StyleSheet, 
  ScrollView, 
  View, 
  Pressable, 
  Dimensions, 
  RefreshControl,
  ActivityIndicator 
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Cartoon, RecommendedClip } from '@/types';
import { API_BASE_URL, API_ENDPOINTS } from '@/config/api';

const { width } = Dimensions.get('window');
const CARTOON_CARD_WIDTH = 140;
const CLIP_CARD_WIDTH = (width - 48) / 2;

export default function HomeScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const router = useRouter();
  
  const [cartoons, setCartoons] = useState<Cartoon[]>([]);
  const [recommendedClips, setRecommendedClips] = useState<RecommendedClip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 从服务器获取首页推荐的动画片（只获取 is_featured=true 的）
  const fetchCartoons = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/app/cartoons?featured_only=true`);
      if (response.ok) {
        const data = await response.json();
        // 服务器返回 { items: [...], total, page, ... } 格式
        const items = data.items || data;
        const formattedCartoons: Cartoon[] = (Array.isArray(items) ? items : []).map((item: any) => ({
          id: item.id,
          name: item.name,
          nameCN: item.nameCN,
          thumbnail: item.thumbnail,
          description: item.description,
        }));
        setCartoons(formattedCartoons);
      }
    } catch (error) {
      console.error('获取动画片列表失败:', error);
    }
  };

  // 获取推荐片段
  const fetchRecommendedClips = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.recommendations);
      if (response.ok) {
        const data = await response.json();
        // 服务器返回 { items: [...], total, page, ... } 格式
        const items = data.items || data;
        setRecommendedClips(Array.isArray(items) ? items : []);
      }
    } catch (error) {
      console.error('获取推荐片段失败:', error);
    }
  };

  // 加载所有数据
  const fetchAllData = async (showRefreshing = false) => {
    if (showRefreshing) {
      setIsRefreshing(true);
    }
    
    try {
      await Promise.all([fetchCartoons(), fetchRecommendedClips()]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // 页面获得焦点时加载数据
  useFocusEffect(
    useCallback(() => {
      fetchAllData();
    }, [])
  );

  // 下拉刷新
  const onRefresh = useCallback(() => {
    fetchAllData(true);
  }, []);

  const handleCartoonPress = (cartoon: Cartoon) => {
    router.push(`/cartoon/${cartoon.id}`);
  };

  const handleClipPress = (clip: RecommendedClip) => {
    // 直接进入配音页面
    router.push({
      pathname: '/dubbing/[id]',
      params: {
        id: encodeURIComponent(clip.clipPath),
        seasonId: clip.seasonId,
        episodeName: clip.episodeName,
        index: '0'
      }
    });
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <ThemedText style={[styles.loadingText, { color: colors.textSecondary }]}>
            加载中...
          </ThemedText>
        </View>
      ) : (
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
              title="下拉刷新"
              titleColor={colors.textSecondary}
            />
          }
        >
          {/* 热门动画片 - 横向滚动 */}
          <View style={styles.sectionHeader}>
            <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
              🎭 热门动画片
            </ThemedText>
          </View>
          
          {cartoons.length === 0 ? (
            <View style={styles.emptyCartoonContainer}>
              <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                暂无动画片
              </ThemedText>
            </View>
          ) : (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalScrollContent}
              style={styles.horizontalScroll}
            >
              {cartoons.map((cartoon) => (
                <Pressable
                  key={cartoon.id}
                  style={({ pressed }) => [
                    styles.cartoonCard,
                    { 
                      backgroundColor: colors.card,
                      borderColor: colors.cardBorder,
                      transform: [{ scale: pressed ? 0.95 : 1 }],
                    },
                  ]}
                  onPress={() => handleCartoonPress(cartoon)}
                >
                  <Image
                    source={{ uri: cartoon.thumbnail || 'https://picsum.photos/140/100' }}
                    style={styles.cartoonImage}
                    contentFit="cover"
                    transition={300}
                  />
                  <View style={styles.cartoonContent}>
                    <ThemedText style={[styles.cartoonTitle, { color: colors.text }]} numberOfLines={1}>
                      {cartoon.nameCN}
                    </ThemedText>
                    <ThemedText style={[styles.cartoonSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                      {cartoon.name}
                    </ThemedText>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {/* 推荐配音片段 */}
          <View style={[styles.sectionHeader, { marginTop: 24 }]}>
            <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
              ⭐ 推荐配音
            </ThemedText>
            <ThemedText style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
              点击即可开始配音练习
            </ThemedText>
          </View>
          
          {recommendedClips.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ThemedText style={[styles.emptyIcon]}>🎤</ThemedText>
              <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                暂无推荐片段
              </ThemedText>
              <ThemedText style={[styles.emptyHint, { color: colors.textSecondary }]}>
                请在后台管理生成推荐
              </ThemedText>
            </View>
          ) : (
            <View style={styles.clipGrid}>
              {recommendedClips.map((clip) => (
                <Pressable
                  key={clip.id}
                  style={({ pressed }) => [
                    styles.clipCard,
                    { 
                      backgroundColor: colors.card,
                      borderColor: colors.cardBorder,
                      transform: [{ scale: pressed ? 0.95 : 1 }],
                    },
                  ]}
                  onPress={() => handleClipPress(clip)}
                >
                  <Image
                    source={{ uri: clip.thumbnail || 'https://picsum.photos/200/120' }}
                    style={styles.clipImage}
                    contentFit="cover"
                    transition={300}
                  />
                  <View style={styles.clipPlayIcon}>
                    <ThemedText style={styles.playIconText}>▶</ThemedText>
                  </View>
                  <View style={styles.clipDuration}>
                    <ThemedText style={styles.durationText}>
                      {clip.duration.toFixed(1)}s
                    </ThemedText>
                  </View>
                  <View style={styles.clipContent}>
                    <ThemedText style={[styles.clipText, { color: colors.text }]} numberOfLines={2}>
                      {clip.originalText}
                    </ThemedText>
                    {clip.translationCN && (
                      <ThemedText style={[styles.clipTranslation, { color: colors.textSecondary }]} numberOfLines={1}>
                        {clip.translationCN}
                      </ThemedText>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {/* 底部提示 */}
          <View style={styles.footer}>
            <ThemedText style={[styles.footerText, { color: colors.textSecondary }]}>
              👆 选择一个片段开始你的配音之旅！
            </ThemedText>
          </View>
        </ScrollView>
      )}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 60,
    paddingBottom: 40,
  },
  sectionHeader: {
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  sectionSubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  // 热门动画横向滚动样式
  horizontalScroll: {
    flexGrow: 0,
  },
  horizontalScrollContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  cartoonCard: {
    width: CARTOON_CARD_WIDTH,
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cartoonImage: {
    width: '100%',
    height: 90,
  },
  cartoonContent: {
    padding: 10,
  },
  cartoonTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  cartoonSubtitle: {
    fontSize: 11,
  },
  emptyCartoonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  // 推荐片段网格样式
  clipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  clipCard: {
    width: CLIP_CARD_WIDTH,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  clipImage: {
    width: '100%',
    height: CLIP_CARD_WIDTH * 0.6,
  },
  clipPlayIcon: {
    position: 'absolute',
    top: CLIP_CARD_WIDTH * 0.3 - 20,
    left: '50%',
    marginLeft: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIconText: {
    color: 'white',
    fontSize: 16,
    marginLeft: 2,
  },
  clipDuration: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '500',
  },
  clipContent: {
    padding: 10,
  },
  clipText: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  clipTranslation: {
    fontSize: 11,
    marginTop: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 15,
  },
  emptyHint: {
    fontSize: 13,
    marginTop: 4,
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  footerText: {
    fontSize: 14,
  },
});
