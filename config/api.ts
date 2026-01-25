// API 配置
// 开发环境使用本地地址，生产环境使用实际服务器地址

import { Platform } from 'react-native';

// ⚠️ 如果使用真机测试，请将下面的 IP 改为你电脑的局域网 IP
// Windows: 在命令行运行 ipconfig 查看
// Mac: 在终端运行 ifconfig 或在系统设置中查看
const LOCAL_IP = '192.168.0.100'; // 修改为你的电脑IP

// 生产服务器地址
const PROD_SERVER = 'https://peiyin2.coding61.com';

// 根据平台选择合适的地址
const getBaseUrl = () => {
  // 使用远程服务器
  return PROD_SERVER;
};

export const API_BASE_URL = getBaseUrl();

// Vosk 语音评分服务（独立服务，客户端直接调用）
export const VOSK_SERVICE_URL = 'https://vosk.coding61.com';

// API 端点
export const API_ENDPOINTS = {
  // Vosk 评分（直接调用独立服务）
  voskScore: `${VOSK_SERVICE_URL}/score`,
  
  // 后端评分（保留，用于记录评分历史）
  score: `${API_BASE_URL}/api/score`,
  health: `${API_BASE_URL}/health`,
  
  // App API
  cartoons: `${API_BASE_URL}/api/app/cartoons`,
  cartoon: (id: string) => `${API_BASE_URL}/api/app/cartoons/${id}`,
  seasons: (cartoonId: string) => `${API_BASE_URL}/api/app/cartoons/${cartoonId}/seasons`,
  episodes: (seasonId: string) => `${API_BASE_URL}/api/app/seasons/${seasonId}/episodes`,
  episodeDetail: (seasonId: string, episodeName: string) => 
    `${API_BASE_URL}/api/app/seasons/${seasonId}/episodes/${encodeURIComponent(episodeName)}`,
  clips: (seasonId: string, episodeName: string) => 
    `${API_BASE_URL}/api/app/seasons/${seasonId}/episodes/${encodeURIComponent(episodeName)}/clips`,
  
  // 推荐片段
  recommendations: `${API_BASE_URL}/api/app/recommendations`,
  
  // 用户相关
  userStats: (userId: string) => `${API_BASE_URL}/api/app/user/${userId}/stats`,
  userRecords: (userId: string) => `${API_BASE_URL}/api/app/user/${userId}/records`,
  clipRecords: (userId: string, clipPath: string) => 
    `${API_BASE_URL}/api/app/user/${userId}/records?clip_path=${encodeURIComponent(clipPath)}`,
  
  // 字典 API (独立服务)
  wordLookup: (word: string) => `http://english-dict.coding61.com/word/${encodeURIComponent(word.toLowerCase())}`,
  wordStatus: (word: string) => `http://english-dict.coding61.com/word/${encodeURIComponent(word.toLowerCase())}/status`,
  
  // 人声去除 API
  vocalRemoval: `${API_BASE_URL}/api/app/vocal-removal`,
  vocalRemovalStatus: (videoUrl: string) => `${API_BASE_URL}/api/app/vocal-removal?video_url=${encodeURIComponent(videoUrl)}`,
  
  // 视频合成 API
  compositeVideo: `${API_BASE_URL}/api/app/composite-video`,
  compositeVideoStatus: (taskId: number) => `${API_BASE_URL}/api/app/composite-video?task_id=${taskId}`,
  
  // 用户配音 API
  userDubbings: (userId: string) => `${API_BASE_URL}/api/app/user/${userId}/dubbings`,
  publicDubbings: `${API_BASE_URL}/api/app/dubbings/public`,
  updateDubbingPublic: (userId: string, dubbingId: number) => 
    `${API_BASE_URL}/api/app/user/${userId}/dubbings/${dubbingId}/public`,
  deleteDubbing: (userId: string, dubbingId: number) => 
    `${API_BASE_URL}/api/app/user/${userId}/dubbings/${dubbingId}`,
};

/**
 * 将视频路径转换为流式视频 URL（支持 Range 请求）
 * 后端的 composite_video_path 格式为 /user_dubbings/xxx.mp4
 * 需要转换为 /api/app/video/xxx.mp4
 * 
 * @param path 视频路径，如 /user_dubbings/xxx.mp4
 * @returns 完整的流式视频 URL
 */
export const getStreamingVideoUrl = (path: string): string => {
  if (!path) return '';
  
  // 从 /user_dubbings/xxx.mp4 提取文件名
  const filename = path.replace(/^\/user_dubbings\//, '');
  
  return `${API_BASE_URL}/api/app/video/${filename}`;
};

/**
 * 将去人声视频路径转换为完整 URL
 * 后端的 output_video_path 格式为 /media_cache/mute_video/xxx.mp4
 * 
 * @param path 视频路径，如 /media_cache/mute_video/xxx.mp4
 * @returns 完整的视频 URL
 */
export const getVocalRemovedVideoUrl = (path: string): string => {
  if (!path) return '';
  
  // 如果已经是完整 URL，直接返回
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  
  // 去掉开头的斜杠
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  return `${API_BASE_URL}/${cleanPath}`;
};

// 调试用：打印当前 API 地址
if (__DEV__) {
  console.log('API Base URL:', API_BASE_URL);
}
