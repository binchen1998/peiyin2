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
import { Cartoon } from '@/types';
import { API_BASE_URL } from '@/config/api';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

export default function HomeScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const router = useRouter();
  
  const [cartoons, setCartoons] = useState<Cartoon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 从服务器获取动画片列表
  const fetchCartoons = async (showRefreshing = false) => {
    if (showRefreshing) {
      setIsRefreshing(true);
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/app/cartoons`);
      if (response.ok) {
        const data = await response.json();
        // 转换API响应格式
        const formattedCartoons: Cartoon[] = data.map((item: any) => ({
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
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // 页面获得焦点时加载数据
  useFocusEffect(
    useCallback(() => {
      fetchCartoons();
    }, [])
  );

  // 下拉刷新
  const onRefresh = useCallback(() => {
    fetchCartoons(true);
  }, []);

  const handleCartoonPress = (cartoon: Cartoon) => {
    router.push(`/cartoon/${cartoon.id}`);
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
          <View style={styles.sectionHeader}>
            <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
              🎭 热门动画片
            </ThemedText>
          </View>
          
          {cartoons.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ThemedText style={[styles.emptyIcon]}>🎬</ThemedText>
              <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
                暂无动画片，请在后台添加
              </ThemedText>
            </View>
          ) : (
            <View style={styles.grid}>
              {cartoons.map((cartoon) => (
                <Pressable
                  key={cartoon.id}
                  style={({ pressed }) => [
                    styles.card,
                    { 
                      backgroundColor: colors.card,
                      borderColor: colors.cardBorder,
                      transform: [{ scale: pressed ? 0.95 : 1 }],
                    },
                  ]}
                  onPress={() => handleCartoonPress(cartoon)}
                >
                  <Image
                    source={{ uri: cartoon.thumbnail }}
                    style={styles.cardImage}
                    contentFit="cover"
                    transition={300}
                  />
                  <View style={styles.cardContent}>
                    <ThemedText style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                      {cartoon.nameCN}
                    </ThemedText>
                    <ThemedText style={[styles.cardSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                      {cartoon.name}
                    </ThemedText>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {/* 底部提示 */}
          {cartoons.length > 0 && (
            <View style={styles.footer}>
              <ThemedText style={[styles.footerText, { color: colors.textSecondary }]}>
                👆 点击动画片开始你的配音之旅！
              </ThemedText>
            </View>
          )}
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
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 40,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardImage: {
    width: '100%',
    height: CARD_WIDTH * 0.7,
  },
  cardContent: {
    padding: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
  },
});
