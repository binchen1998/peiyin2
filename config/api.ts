// API 配置
// 开发环境使用本地地址，生产环境使用实际服务器地址

import { Platform } from 'react-native';

// ⚠️ 如果使用真机测试，请将下面的 IP 改为你电脑的局域网 IP
// Windows: 在命令行运行 ipconfig 查看
// Mac: 在终端运行 ifconfig 或在系统设置中查看
const LOCAL_IP = '192.168.1.100'; // 修改为你的电脑IP

// 根据平台选择合适的地址
const getBaseUrl = () => {
  if (__DEV__) {
    // 开发环境
    if (Platform.OS === 'web') {
      // Web 端直接使用 localhost
      return 'http://localhost:8000';
    }
    if (Platform.OS === 'android') {
      // Android 模拟器使用 10.0.2.2 访问主机的 localhost
      // 如果是真机，需要使用电脑的局域网 IP
      return 'http://10.0.2.2:8000';
      // 真机请使用: return `http://${LOCAL_IP}:8000`;
    }
    if (Platform.OS === 'ios') {
      // iOS 模拟器可以使用 localhost
      // iOS 真机需要使用电脑的局域网 IP
      return 'http://localhost:8000';
      // 真机请使用: return `http://${LOCAL_IP}:8000`;
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

// 调试用：打印当前 API 地址
if (__DEV__) {
  console.log('API Base URL:', API_BASE_URL);
}
