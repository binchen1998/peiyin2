// API 配置
// 开发环境使用本地地址，生产环境使用实际服务器地址

import { Platform } from 'react-native';

// ⚠️ 如果使用真机测试，请将下面的 IP 改为你电脑的局域网 IP
// Windows: 在命令行运行 ipconfig 查看
// Mac: 在终端运行 ifconfig 或在系统设置中查看
const LOCAL_IP = '192.168.0.100'; // 修改为你的电脑IP

// 根据平台选择合适的地址
const getBaseUrl = () => {
  if (__DEV__) {
    return `http://${LOCAL_IP}:8000`;
  }
  // 生产环境 - 替换为实际的服务器地址
  return 'https://your-production-server.com';
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

// 调试用：打印当前 API 地址
if (__DEV__) {
  console.log('API Base URL:', API_BASE_URL);
}
