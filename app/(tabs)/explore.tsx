import { useState, useCallback } from 'react';
import { 
  StyleSheet, 
  ScrollView, 
  View, 
  Pressable, 
  Modal, 
  TextInput,
  Platform,
  Alert
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useUserProfile, getUserId } from '@/hooks/use-user-profile';
import { API_BASE_URL } from '@/config/api';

interface LearningStats {
  dubbingCount: number;
  averageScore: number;
  learningDays: number;
}

// 徽章定义
interface Badge {
  id: string;
  emoji: string;
  name: string;
  description: string;  // 获得标准
  bgColor: string;
  checkUnlocked: (stats: LearningStats) => boolean;
}

const BADGES: Badge[] = [
  {
    id: 'first_dubbing',
    emoji: '🌟',
    name: '初次配音',
    description: '完成第1次配音',
    bgColor: '#FEF3C7',
    checkUnlocked: (stats) => stats.dubbingCount >= 1,
  },
  {
    id: 'dubbing_10',
    emoji: '🎤',
    name: '小小配音员',
    description: '完成10次配音',
    bgColor: '#FCE7F3',
    checkUnlocked: (stats) => stats.dubbingCount >= 10,
  },
  {
    id: 'dubbing_50',
    emoji: '🎙️',
    name: '配音达人',
    description: '完成50次配音',
    bgColor: '#FED7AA',
    checkUnlocked: (stats) => stats.dubbingCount >= 50,
  },
  {
    id: 'dubbing_100',
    emoji: '🏅',
    name: '配音大师',
    description: '完成100次配音',
    bgColor: '#FDE047',
    checkUnlocked: (stats) => stats.dubbingCount >= 100,
  },
  {
    id: 'score_80',
    emoji: '🎯',
    name: '精准发音',
    description: '平均分数达到80分',
    bgColor: '#D1FAE5',
    checkUnlocked: (stats) => stats.averageScore >= 80,
  },
  {
    id: 'score_90',
    emoji: '💎',
    name: '发音专家',
    description: '平均分数达到90分',
    bgColor: '#A5F3FC',
    checkUnlocked: (stats) => stats.averageScore >= 90,
  },
  {
    id: 'days_3',
    emoji: '📚',
    name: '学习新星',
    description: '累计学习3天',
    bgColor: '#DBEAFE',
    checkUnlocked: (stats) => stats.learningDays >= 3,
  },
  {
    id: 'days_7',
    emoji: '🔥',
    name: '坚持一周',
    description: '累计学习7天',
    bgColor: '#FEE2E2',
    checkUnlocked: (stats) => stats.learningDays >= 7,
  },
  {
    id: 'days_30',
    emoji: '👑',
    name: '学习王者',
    description: '累计学习30天',
    bgColor: '#E9D5FF',
    checkUnlocked: (stats) => stats.learningDays >= 30,
  },
];

export default function ProfileScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { profile, saveProfile, getAge } = useUserProfile();
  
  const [showEditModal, setShowEditModal] = useState(false);
  const [editNickname, setEditNickname] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [stats, setStats] = useState<LearningStats>({
    dubbingCount: 0,
    averageScore: 0,
    learningDays: 0,
  });

  const age = getAge();

  // 获取学习统计
  const fetchStats = async () => {
    try {
      const userId = await getUserId();
      const response = await fetch(`${API_BASE_URL}/api/app/user/${userId}/stats`);
      if (response.ok) {
        const data = await response.json();
        setStats({
          dubbingCount: data.dubbing_count,
          averageScore: data.average_score,
          learningDays: data.learning_days,
        });
      }
    } catch (error) {
      console.error('获取学习统计失败:', error);
    }
  };

  // 每次页面获得焦点时刷新统计
  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [])
  );

  const openEditModal = () => {
    setEditNickname(profile.nickname);
    if (profile.birthDate) {
      setSelectedDate(new Date(profile.birthDate));
    }
    setShowEditModal(true);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('提示', '需要相册权限才能选择头像');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await saveProfile({ avatarUri: result.assets[0].uri });
    }
  };

  const handleSaveProfile = async () => {
    await saveProfile({
      nickname: editNickname.trim() || '小小配音家',
      birthDate: selectedDate.toISOString(),
    });
    setShowEditModal(false);
  };

  const onDateChange = (event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (date) {
      setSelectedDate(date);
    }
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '未设置';
    const date = new Date(dateString);
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  };

  // 计算已获得徽章数量
  const unlockedCount = BADGES.filter(badge => badge.checkUnlocked(stats)).length;

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 顶部用户信息 */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <View style={styles.avatarContainer}>
          <Pressable onPress={pickImage}>
            <View style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
              {profile.avatarUri ? (
                <Image 
                  source={{ uri: profile.avatarUri }} 
                  style={styles.avatarImage}
                  contentFit="cover"
                />
              ) : (
                <ThemedText style={styles.avatarText}>🧒</ThemedText>
              )}
            </View>
            <View style={styles.editAvatarBadge}>
              <ThemedText style={styles.editAvatarIcon}>📷</ThemedText>
            </View>
          </Pressable>
          <Pressable onPress={openEditModal}>
            <ThemedText style={styles.userName}>{profile.nickname}</ThemedText>
          </Pressable>
          <ThemedText style={styles.userLevel}>
            {age !== null ? `${age}岁 · ` : ''}⭐ 初级学员
          </ThemedText>
        </View>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 个人信息卡片 */}
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.infoHeader}>
            <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
              👤 个人信息
            </ThemedText>
            <Pressable onPress={openEditModal}>
              <ThemedText style={[styles.editButton, { color: colors.primary }]}>编辑</ThemedText>
            </Pressable>
          </View>
          <View style={styles.infoRow}>
            <ThemedText style={[styles.infoLabel, { color: colors.textSecondary }]}>昵称</ThemedText>
            <ThemedText style={[styles.infoValue, { color: colors.text }]}>{profile.nickname}</ThemedText>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <ThemedText style={[styles.infoLabel, { color: colors.textSecondary }]}>出生日期</ThemedText>
            <ThemedText style={[styles.infoValue, { color: colors.text }]}>{formatDate(profile.birthDate)}</ThemedText>
          </View>
        </View>

        {/* 学习统计 */}
        <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
            📊 学习统计
          </ThemedText>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>配音次数</ThemedText>
              <ThemedText style={[styles.statValue, { color: colors.primary }]}>{stats.dubbingCount}</ThemedText>
            </View>
            <View style={styles.statItem}>
              <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>平均分数</ThemedText>
              <ThemedText style={[styles.statValue, { color: colors.success }]}>{stats.averageScore}</ThemedText>
            </View>
            <View style={styles.statItem}>
              <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>学习天数</ThemedText>
              <ThemedText style={[styles.statValue, { color: colors.secondary }]}>{stats.learningDays}</ThemedText>
            </View>
          </View>
        </View>

        {/* 成就徽章 */}
        <View style={[styles.achievementCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.achievementHeader}>
            <ThemedText style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>
              🏆 成就徽章
            </ThemedText>
            <ThemedText style={[styles.badgeProgress, { color: colors.textSecondary }]}>
              {unlockedCount}/{BADGES.length}
            </ThemedText>
          </View>
          <View style={styles.badgeGrid}>
            {BADGES.map((badge) => {
              const isUnlocked = badge.checkUnlocked(stats);
              return (
                <View key={badge.id} style={styles.badgeItem}>
                  <View style={styles.badgeWrapper}>
                    <View style={[styles.badge, { backgroundColor: badge.bgColor }]}>
                      <ThemedText style={styles.badgeEmoji}>{badge.emoji}</ThemedText>
                    </View>
                    {/* 未解锁蒙版 */}
                    {!isUnlocked && (
                      <View style={styles.badgeMask}>
                        <ThemedText style={styles.lockIcon}>🔒</ThemedText>
                      </View>
                    )}
                  </View>
                  <ThemedText style={[
                    styles.badgeLabel, 
                    { color: isUnlocked ? colors.text : colors.textSecondary }
                  ]}>
                    {badge.name}
                  </ThemedText>
                  <ThemedText style={[styles.badgeDesc, { color: colors.textSecondary }]}>
                    {badge.description}
                  </ThemedText>
                </View>
              );
            })}
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
        </View>
      </ScrollView>

      {/* 编辑个人信息模态框 */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <ThemedText style={[styles.modalTitle, { color: colors.text }]}>编辑个人信息</ThemedText>
              <Pressable onPress={() => setShowEditModal(false)}>
                <ThemedText style={styles.modalClose}>✕</ThemedText>
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.formGroup}>
                <ThemedText style={[styles.formLabel, { color: colors.text }]}>昵称</ThemedText>
                <TextInput
                  style={[styles.formInput, { 
                    backgroundColor: colors.backgroundSecondary,
                    color: colors.text,
                    borderColor: colors.cardBorder
                  }]}
                  value={editNickname}
                  onChangeText={setEditNickname}
                  placeholder="输入昵称"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={20}
                />
              </View>

              <View style={styles.formGroup}>
                <ThemedText style={[styles.formLabel, { color: colors.text }]}>出生日期</ThemedText>
                <Pressable 
                  style={[styles.dateButton, { 
                    backgroundColor: colors.backgroundSecondary,
                    borderColor: colors.cardBorder
                  }]}
                  onPress={() => setShowDatePicker(true)}
                >
                  <ThemedText style={[styles.dateButtonText, { color: colors.text }]}>
                    {selectedDate.getFullYear()}年{selectedDate.getMonth() + 1}月{selectedDate.getDate()}日
                  </ThemedText>
                </Pressable>
              </View>

              {showDatePicker && (
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onDateChange}
                  maximumDate={new Date()}
                  minimumDate={new Date(2010, 0, 1)}
                />
              )}

              {Platform.OS === 'ios' && showDatePicker && (
                <Pressable 
                  style={[styles.confirmDateButton, { backgroundColor: colors.primary }]}
                  onPress={() => setShowDatePicker(false)}
                >
                  <ThemedText style={styles.confirmDateText}>确定</ThemedText>
                </Pressable>
              )}
            </View>

            <View style={styles.modalFooter}>
              <Pressable 
                style={[styles.cancelButton, { borderColor: colors.cardBorder }]}
                onPress={() => setShowEditModal(false)}
              >
                <ThemedText style={[styles.cancelButtonText, { color: colors.text }]}>取消</ThemedText>
              </Pressable>
              <Pressable 
                style={[styles.saveButton, { backgroundColor: colors.primary }]}
                onPress={handleSaveProfile}
              >
                <ThemedText style={styles.saveButtonText}>保存</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    overflow: 'hidden',
  },
  avatarImage: {
    width: 80,
    height: 80,
  },
  avatarText: {
    fontSize: 40,
  },
  editAvatarBadge: {
    position: 'absolute',
    bottom: 8,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editAvatarIcon: {
    fontSize: 14,
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
  infoCard: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 16,
    marginBottom: 16,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  editButton: {
    fontSize: 14,
    fontWeight: '500',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  infoLabel: {
    fontSize: 14,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
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
  achievementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  badgeProgress: {
    fontSize: 14,
    fontWeight: '500',
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  badgeItem: {
    width: '30%',
    alignItems: 'center',
    marginBottom: 20,
  },
  badgeWrapper: {
    position: 'relative',
  },
  badge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  badgeMask: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIcon: {
    fontSize: 20,
  },
  badgeEmoji: {
    fontSize: 28,
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  badgeDesc: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
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
  },
  // 模态框样式
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalClose: {
    fontSize: 20,
    color: '#999',
  },
  modalBody: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  formInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  dateButton: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  dateButtonText: {
    fontSize: 16,
  },
  confirmDateButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmDateText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    paddingBottom: 40,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
