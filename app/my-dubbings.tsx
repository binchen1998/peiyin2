import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Pressable, FlatList, Dimensions, ActivityIndicator, Modal, Alert, Linking, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VideoPlayer } from '@/components/video-player';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { API_BASE_URL, API_ENDPOINTS, getStreamingVideoUrl } from '@/config/api';
import { getUserId } from '@/hooks/use-user-profile';

const { width } = Dimensions.get('window');

interface UserDubbing {
  id: number;
  user_id: string;
  clip_path: string;
  season_id: string | null;
  original_video_url: string;
  composite_video_path: string | null;
  status: string;
  is_public: boolean;
  original_text: string | null;
  translation_cn: string | null;
  thumbnail: string | null;
  duration: number;
  created_at: string;
}

export default function MyDubbingsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const router = useRouter();

  const [dubbings, setDubbings] = useState<UserDubbing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);

  // 预览弹窗
  const [previewDubbing, setPreviewDubbing] = useState<UserDubbing | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // 下载状态
  const [downloading, setDownloading] = useState<number | null>(null);

  useEffect(() => {
    loadDubbings();
  }, []);

  const loadDubbings = async (pageNum: number = 1, refresh: boolean = false) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else if (pageNum === 1) {
        setLoading(true);
      }

      const userId = await getUserId();
      const response = await fetch(`${API_ENDPOINTS.userDubbings(userId)}?page=${pageNum}&page_size=20`);
      
      if (!response.ok) {
        throw new Error('加载失败');
      }

      const data = await response.json();
      
      if (refresh || pageNum === 1) {
        setDubbings(data.items);
      } else {
        setDubbings(prev => [...prev, ...data.items]);
      }
      
      setTotal(data.total);
      setHasMore(data.page < data.total_pages);
      setPage(pageNum);
    } catch (err) {
      console.error('加载配音列表失败:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = useCallback(() => {
    loadDubbings(1, true);
  }, []);

  const handleLoadMore = useCallback(() => {
    if (hasMore && !loading) {
      loadDubbings(page + 1);
    }
  }, [hasMore, loading, page]);

  const handlePreview = (dubbing: UserDubbing) => {
    if (dubbing.status === 'completed' && dubbing.composite_video_path) {
      setPreviewDubbing(dubbing);
      setShowPreviewModal(true);
    }
  };

  const handleDownload = async (dubbing: UserDubbing) => {
    if (!dubbing.composite_video_path) return;

    try {
      // 请求媒体库权限
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('权限不足', '需要存储权限才能下载视频');
        return;
      }

      setDownloading(dubbing.id);

      const videoUrl = getStreamingVideoUrl(dubbing.composite_video_path);
      const fileName = `dubbing_${dubbing.id}_${Date.now()}.mp4`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;

      // 下载文件
      const downloadResult = await FileSystem.downloadAsync(videoUrl, fileUri);
      
      if (downloadResult.status !== 200) {
        throw new Error('下载失败');
      }

      // 保存到相册
      const asset = await MediaLibrary.createAssetAsync(downloadResult.uri);
      await MediaLibrary.createAlbumAsync('配音练习', asset, false);

      Alert.alert('下载成功', '视频已保存到相册');
    } catch (err) {
      console.error('下载失败:', err);
      Alert.alert('下载失败', '请重试');
    } finally {
      setDownloading(null);
    }
  };

  const handleTogglePublic = async (dubbing: UserDubbing) => {
    try {
      const userId = await getUserId();
      const response = await fetch(
        `${API_ENDPOINTS.updateDubbingPublic(userId, dubbing.id)}?is_public=${!dubbing.is_public}`,
        { method: 'PUT' }
      );

      if (response.ok) {
        // 更新本地状态
        setDubbings(prev => 
          prev.map(d => d.id === dubbing.id ? { ...d, is_public: !d.is_public } : d)
        );
      }
    } catch (err) {
      console.error('更新公开状态失败:', err);
    }
  };

  const handleDelete = async (dubbing: UserDubbing) => {
    Alert.alert(
      '确认删除',
      '确定要删除这个配音吗？此操作不可恢复。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              const userId = await getUserId();
              const response = await fetch(API_ENDPOINTS.deleteDubbing(userId, dubbing.id), {
                method: 'DELETE'
              });

              if (response.ok) {
                setDubbings(prev => prev.filter(d => d.id !== dubbing.id));
                setTotal(prev => prev - 1);
              }
            } catch (err) {
              console.error('删除失败:', err);
              Alert.alert('删除失败', '请重试');
            }
          }
        }
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '等待处理';
      case 'processing': return '处理中...';
      case 'completed': return '已完成';
      case 'failed': return '处理失败';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return colors.warning;
      case 'processing': return colors.primary;
      case 'completed': return colors.success;
      case 'failed': return colors.error;
      default: return colors.textSecondary;
    }
  };

  const renderItem = ({ item }: { item: UserDubbing }) => (
    <Pressable 
      style={[styles.dubbingItem, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
      onPress={() => handlePreview(item)}
    >
      {/* 缩略图 */}
      <View style={styles.thumbnailContainer}>
        {item.thumbnail ? (
          <Image
            source={{ uri: item.thumbnail }}
            style={styles.thumbnail}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.thumbnailPlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
            <IconSymbol name="video.fill" size={24} color={colors.textSecondary} />
          </View>
        )}
        {/* 时长 */}
        <View style={styles.durationBadge}>
          <ThemedText style={styles.durationText}>
            {item.duration ? `${item.duration.toFixed(1)}s` : '--'}
          </ThemedText>
        </View>
      </View>

      {/* 信息 */}
      <View style={styles.infoContainer}>
        <ThemedText style={[styles.originalText, { color: colors.text }]} numberOfLines={2}>
          {item.original_text || '无台词'}
        </ThemedText>
        
        <View style={styles.metaRow}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <ThemedText style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {getStatusText(item.status)}
            </ThemedText>
          </View>
          <ThemedText style={[styles.dateText, { color: colors.textSecondary }]}>
            {formatDate(item.created_at)}
          </ThemedText>
        </View>

        {/* 操作按钮 */}
        <View style={styles.actionRow}>
          {item.status === 'completed' && (
            <>
              <Pressable 
                style={[styles.actionBtn, { backgroundColor: colors.primary + '20' }]}
                onPress={() => handleDownload(item)}
                disabled={downloading === item.id}
              >
                {downloading === item.id ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <IconSymbol name="arrow.down.circle.fill" size={18} color={colors.primary} />
                )}
              </Pressable>
              <Pressable 
                style={[styles.actionBtn, { backgroundColor: item.is_public ? colors.success + '20' : colors.backgroundSecondary }]}
                onPress={() => handleTogglePublic(item)}
              >
                <IconSymbol 
                  name={item.is_public ? "eye.fill" : "eye.slash.fill"} 
                  size={18} 
                  color={item.is_public ? colors.success : colors.textSecondary} 
                />
              </Pressable>
            </>
          )}
          <Pressable 
            style={[styles.actionBtn, { backgroundColor: colors.error + '20' }]}
            onPress={() => handleDelete(item)}
          >
            <IconSymbol name="trash.fill" size={18} color={colors.error} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <IconSymbol name="video.slash.fill" size={48} color={colors.textSecondary} />
      <ThemedText style={[styles.emptyText, { color: colors.textSecondary }]}>
        还没有录制配音
      </ThemedText>
      <ThemedText style={[styles.emptyHint, { color: colors.textSecondary }]}>
        去配音页面录制你的第一个配音吧
      </ThemedText>
    </View>
  );

  const renderFooter = () => {
    if (!hasMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 顶部导航 */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.cardBorder }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol name="chevron.left" size={24} color={colors.primary} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: colors.text }]}>我的配音</ThemedText>
        <View style={styles.headerRight}>
          <ThemedText style={[styles.countText, { color: colors.textSecondary }]}>
            共 {total} 个
          </ThemedText>
        </View>
      </View>

      {/* 列表 */}
      {loading && page === 1 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={dubbings}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          contentContainerStyle={dubbings.length === 0 ? styles.emptyList : styles.list}
        />
      )}

      {/* 预览弹窗 */}
      <Modal
        visible={showPreviewModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPreviewModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.previewModal, { backgroundColor: colors.card }]}>
            <Pressable 
              style={styles.closeButton}
              onPress={() => setShowPreviewModal(false)}
            >
              <IconSymbol name="xmark.circle.fill" size={32} color={colors.textSecondary} />
            </Pressable>

            {previewDubbing && previewDubbing.composite_video_path && (
              <>
                <ThemedText style={{ color: colors.textSecondary, fontSize: 10, padding: 8 }}>
                  视频: {getStreamingVideoUrl(previewDubbing.composite_video_path)}
                </ThemedText>
                <VideoPlayer
                  uri={getStreamingVideoUrl(previewDubbing.composite_video_path)}
                  style={styles.previewVideo}
                  autoPlay={true}
                />
                
                <View style={styles.previewInfo}>
                  <ThemedText style={[styles.previewText, { color: colors.text }]} numberOfLines={2}>
                    {previewDubbing.original_text || '无台词'}
                  </ThemedText>
                  {previewDubbing.translation_cn && (
                    <ThemedText style={[styles.previewTranslation, { color: colors.textSecondary }]}>
                      {previewDubbing.translation_cn}
                    </ThemedText>
                  )}
                </View>

                <View style={styles.previewActions}>
                  <Pressable 
                    style={[styles.previewActionBtn, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      setShowPreviewModal(false);
                      handleDownload(previewDubbing);
                    }}
                  >
                    <IconSymbol name="arrow.down.circle.fill" size={20} color="#FFFFFF" />
                    <ThemedText style={styles.previewActionText}>下载到相册</ThemedText>
                  </Pressable>
                </View>
              </>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    width: 60,
    alignItems: 'flex-end',
  },
  countText: {
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    padding: 16,
    gap: 12,
  },
  emptyList: {
    flex: 1,
  },
  dubbingItem: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  thumbnailContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '500',
  },
  infoContainer: {
    flex: 1,
    marginLeft: 12,
  },
  originalText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
  },
  dateText: {
    fontSize: 11,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 16,
  },
  emptyHint: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  previewModal: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    overflow: 'hidden',
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
  },
  previewVideo: {
    width: '100%',
    height: 250,
    backgroundColor: '#000',
  },
  previewInfo: {
    padding: 16,
  },
  previewText: {
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 24,
  },
  previewTranslation: {
    fontSize: 14,
    marginTop: 8,
    lineHeight: 20,
  },
  previewActions: {
    padding: 16,
    paddingTop: 0,
  },
  previewActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  previewActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
