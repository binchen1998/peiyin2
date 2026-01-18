import { Image } from 'expo-image';
import { StyleSheet, ScrollView, View, Pressable, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getCartoons } from '@/data/mock-data';
import { Cartoon } from '@/types';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

export default function HomeScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const router = useRouter();
  const cartoons = getCartoons();

  const handleCartoonPress = (cartoon: Cartoon) => {
    router.push(`/cartoon/${cartoon.id}`);
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 动画片列表 */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHeader}>
          <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
            🎭 热门动画片
          </ThemedText>
        </View>
        
        <View style={styles.grid}>
          {cartoons.map((cartoon, index) => (
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
              <View style={styles.cardImageContainer}>
                <Image
                  source={{ uri: cartoon.thumbnail }}
                  style={styles.cardImage}
                  contentFit="cover"
                  transition={300}
                />
                <View style={[styles.cardBadge, { backgroundColor: getCardColor(index) }]}>
                  <ThemedText style={styles.cardBadgeText}>
                    {getCardEmoji(index)}
                  </ThemedText>
                </View>
              </View>
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

        {/* 底部提示 */}
        <View style={styles.footer}>
          <ThemedText style={[styles.footerText, { color: colors.textSecondary }]}>
            👆 点击动画片开始你的配音之旅！
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

// 获取卡片装饰颜色
const getCardColor = (index: number): string => {
  const colors = ['#FF6B35', '#7C3AED', '#10B981', '#3B82F6', '#EC4899', '#F59E0B'];
  return colors[index % colors.length];
};

// 获取卡片装饰表情
const getCardEmoji = (index: number): string => {
  const emojis = ['🐷', '🐕', '❄️', '🤠', '🐠', '🍌'];
  return emojis[index % emojis.length];
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  cardImageContainer: {
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: CARD_WIDTH * 0.7,
  },
  cardBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBadgeText: {
    fontSize: 18,
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
