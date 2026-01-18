import { StyleSheet, ScrollView, View, Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function ProfileScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 顶部用户信息 */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
            <ThemedText style={styles.avatarText}>🧒</ThemedText>
          </View>
          <ThemedText style={styles.userName}>小小配音家</ThemedText>
          <ThemedText style={styles.userLevel}>⭐ 初级学员</ThemedText>
        </View>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 学习统计 */}
        <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
            📊 学习统计
          </ThemedText>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>配音次数</ThemedText>
              <ThemedText style={[styles.statValue, { color: colors.primary }]}>12</ThemedText>
            </View>
            <View style={styles.statItem}>
              <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>平均分数</ThemedText>
              <ThemedText style={[styles.statValue, { color: colors.success }]}>85</ThemedText>
            </View>
            <View style={styles.statItem}>
              <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>学习天数</ThemedText>
              <ThemedText style={[styles.statValue, { color: colors.secondary }]}>3</ThemedText>
            </View>
          </View>
        </View>

        {/* 成就徽章 */}
        <View style={[styles.achievementCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
            🏆 成就徽章
          </ThemedText>
          <View style={styles.badgeGrid}>
            <View style={styles.badgeItem}>
              <View style={[styles.badge, { backgroundColor: '#FEF3C7' }]}>
                <ThemedText style={styles.badgeEmoji}>🌟</ThemedText>
              </View>
              <ThemedText style={[styles.badgeLabel, { color: colors.textSecondary }]}>初次配音</ThemedText>
            </View>
            <View style={styles.badgeItem}>
              <View style={[styles.badge, { backgroundColor: '#DBEAFE' }]}>
                <ThemedText style={styles.badgeEmoji}>📚</ThemedText>
              </View>
              <ThemedText style={[styles.badgeLabel, { color: colors.textSecondary }]}>学习达人</ThemedText>
            </View>
            <View style={styles.badgeItem}>
              <View style={[styles.badge, { backgroundColor: '#D1FAE5' }]}>
                <ThemedText style={styles.badgeEmoji}>🎯</ThemedText>
              </View>
              <ThemedText style={[styles.badgeLabel, { color: colors.textSecondary }]}>精准发音</ThemedText>
            </View>
            <View style={styles.badgeItem}>
              <View style={[styles.badge, { backgroundColor: colors.backgroundSecondary }]}>
                <ThemedText style={styles.badgeEmoji}>🔒</ThemedText>
              </View>
              <ThemedText style={[styles.badgeLabel, { color: colors.textSecondary }]}>待解锁</ThemedText>
            </View>
          </View>
        </View>

        {/* 功能菜单 */}
        <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <MenuItem 
            icon="gear" 
            title="设置" 
            colors={colors}
          />
          <View style={[styles.menuDivider, { backgroundColor: colors.cardBorder }]} />
          <MenuItem 
            icon="questionmark.circle" 
            title="帮助与反馈" 
            colors={colors}
          />
          <View style={[styles.menuDivider, { backgroundColor: colors.cardBorder }]} />
          <MenuItem 
            icon="info.circle" 
            title="关于我们" 
            colors={colors}
          />
        </View>

        {/* 底部版本信息 */}
        <View style={styles.footer}>
          <ThemedText style={[styles.footerText, { color: colors.textSecondary }]}>
            英语配音乐园 v1.0.0
          </ThemedText>
          <ThemedText style={[styles.footerSubText, { color: colors.textSecondary }]}>
            让孩子爱上英语配音 ❤️
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

interface MenuItemProps {
  icon: string;
  title: string;
  colors: typeof Colors.light;
}

function MenuItem({ icon, title, colors }: MenuItemProps) {
  return (
    <Pressable style={styles.menuItem}>
      <View style={styles.menuItemLeft}>
        <IconSymbol name={icon as any} size={22} color={colors.primary} />
        <ThemedText style={[styles.menuItemTitle, { color: colors.text }]}>{title}</ThemedText>
      </View>
      <IconSymbol name="chevron.right" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 30,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  avatarContainer: {
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 40,
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  userLevel: {
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
  statsCard: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  statLabel: {
    fontSize: 12,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  achievementCard: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 16,
    marginBottom: 16,
  },
  badgeGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  badgeItem: {
    alignItems: 'center',
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  badgeEmoji: {
    fontSize: 28,
  },
  badgeLabel: {
    fontSize: 11,
  },
  menuCard: {
    borderRadius: 16,
    borderWidth: 2,
    overflow: 'hidden',
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemTitle: {
    fontSize: 16,
  },
  menuDivider: {
    height: 1,
    marginHorizontal: 16,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  footerText: {
    fontSize: 12,
    marginBottom: 4,
  },
  footerSubText: {
    fontSize: 11,
  },
});
