// API 配置
// 开发环境使用本地地址，生产环境使用实际服务器地址

import { Platform } from 'react-native';

// 根据平台选择合适的地址
// Android 模拟器使用 10.0.2.2 访问主机
// iOS 模拟器可以使用 localhost
// 真机需要使用实际的局域网IP或公网地址
const getBaseUrl = () => {
  if (__DEV__) {
    // 开发环境
    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:8000';
    }
    return 'http://localhost:8000';
  }
  // 生产环境 - 替换为实际的服务器地址
  return 'https://your-production-server.com';
};

export const API_BASE_URL = getBaseUrl();

// API 端点
export const API_ENDPOINTS = {
  score: `${API_BASE_URL}/api/score`,
  health: `${API_BASE_URL}/health`,
};
