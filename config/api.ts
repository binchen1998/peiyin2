// API 配置
// 开发环境使用本地地址，生产环境使用实际服务器地址

import { Platform } from 'react-native';

// ⚠️ 如果使用真机测试，请将下面的 IP 改为你电脑的局域网 IP
// Windows: 在命令行运行 ipconfig 查看
// Mac: 在终端运行 ifconfig 或在系统设置中查看
const LOCAL_IP = '192.168.0.104'; // 修改为你的电脑IP

// 根据平台选择合适的地址
const getBaseUrl = () => {
  if (__DEV__) {
    return 'http://192.168.0.104:8000';
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
