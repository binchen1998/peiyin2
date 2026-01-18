import { Image } from 'expo-image';
import { StyleSheet, ScrollView, View, Pressable, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getCartoon, getSeasons } from '@/data/mock-data';
import { IconSymbol } from '@/components/ui/icon-symbol';

const { width } = Dimensions.get('window');

export default function CartoonDetailScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const cartoon = getCartoon(id);
  const seasons = getSeasons(id);

  if (!cartoon) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
        <ThemedText>动画片不存在</ThemedText>
      </ThemedView>
    );
  }

  const handleSeasonPress = (seasonId: string) => {
    router.push(`/season/${seasonId}?cartoonName=${encodeURIComponent(cartoon.nameCN)}`);
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 顶部图片和返回按钮 */}
      <View style={styles.headerContainer}>
        <Image
          source={{ uri: cartoon.thumbnail }}
          style={styles.headerImage}
          contentFit="cover"
        />
        <View style={styles.headerOverlay} />
        <Pressable 
          style={[styles.backButton, { backgroundColor: 'rgba(255,255,255,0.9)' }]}
          onPress={handleBack}
        >
          <IconSymbol name="chevron.left" size={24} color={colors.primary} />
        </Pressable>
        <View style={styles.headerInfo}>
          <ThemedText style={styles.headerTitle}>{cartoon.nameCN}</ThemedText>
          <ThemedText style={styles.headerSubtitle}>{cartoon.name}</ThemedText>
        </View>
      </View>

      {/* 季节列表 */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHeader}>
          <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
            📺 选择季数
          </ThemedText>
          <ThemedText style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            共 {seasons.length} 季可供学习
          </ThemedText>
        </View>

        <View style={styles.seasonList}>
          {seasons.map((season, index) => (
            <Pressable
              key={season.id}
              style={({ pressed }) => [
                styles.seasonCard,
                { 
                  backgroundColor: colors.card,
                  borderColor: colors.cardBorder,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
              onPress={() => handleSeasonPress(season.id)}
            >
              <View style={[styles.seasonNumber, { backgroundColor: getSeasonColor(index) }]}>
                <ThemedText style={styles.seasonNumberText}>{season.number}</ThemedText>
              </View>
              <View style={styles.seasonInfo}>
                <ThemedText style={[styles.seasonTitle, { color: colors.text }]}>
                  第 {season.number} 季
                </ThemedText>
                <ThemedText style={[styles.seasonDesc, { color: colors.textSecondary }]}>
                  Season {season.number}
                </ThemedText>
              </View>
              <View style={styles.seasonArrow}>
                <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
              </View>
            </Pressable>
          ))}
        </View>

        {/* 动画片简介 */}
        <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <ThemedText style={[styles.descTitle, { color: colors.text }]}>
            📖 简介
          </ThemedText>
          <ThemedText style={[styles.descText, { color: colors.textSecondary }]}>
            {cartoon.description}
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const getSeasonColor = (index: number): string => {
  const colors = ['#FF6B35', '#7C3AED', '#10B981', '#3B82F6', '#EC4899', '#F59E0B'];
  return colors[index % colors.length];
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    position: 'relative',
    height: 220,
  },
  headerImage: {
    width: '100%',
    height: '100%',
  },
  headerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
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
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
  },
  seasonList: {
    gap: 12,
  },
  seasonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  seasonNumber: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seasonNumberText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  seasonInfo: {
    flex: 1,
    marginLeft: 16,
  },
  seasonTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  seasonDesc: {
    fontSize: 14,
  },
  seasonArrow: {
    padding: 8,
  },
  descCard: {
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
  },
  descTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  descText: {
    fontSize: 14,
    lineHeight: 22,
  },
});
