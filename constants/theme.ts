/**
 * 儿童英语配音 App 主题配色
 * 使用明亮、活泼的颜色，适合儿童使用
 */

import { Platform } from 'react-native';

// 主色调 - 活泼的橙色和紫色
const primaryOrange = '#FF6B35';
const primaryPurple = '#7C3AED';
const primaryGreen = '#10B981';
const primaryBlue = '#3B82F6';
const primaryPink = '#EC4899';
const primaryYellow = '#F59E0B';

export const Colors = {
  light: {
    text: '#1F2937',
    textSecondary: '#6B7280',
    background: '#FFFBF5',
    backgroundSecondary: '#FFF7ED',
    tint: primaryOrange,
    icon: '#9CA3AF',
    tabIconDefault: '#9CA3AF',
    tabIconSelected: primaryOrange,
    primary: primaryOrange,
    secondary: primaryPurple,
    success: primaryGreen,
    warning: primaryYellow,
    error: '#EF4444',
    card: '#FFFFFF',
    cardBorder: '#FED7AA',
    accent: primaryPink,
  },
  dark: {
    text: '#F9FAFB',
    textSecondary: '#D1D5DB',
    background: '#1F1B24',
    backgroundSecondary: '#2D2635',
    tint: '#FF8F6B',
    icon: '#9CA3AF',
    tabIconDefault: '#9CA3AF',
    tabIconSelected: '#FF8F6B',
    primary: '#FF8F6B',
    secondary: '#A78BFA',
    success: '#34D399',
    warning: '#FBBF24',
    error: '#F87171',
    card: '#2D2635',
    cardBorder: '#4C3D5C',
    accent: '#F472B6',
  },
};

// 评分颜色
export const ScoreColors = {
  excellent: '#10B981', // 90-100 优秀
  good: '#3B82F6',      // 70-89 良好
  fair: '#F59E0B',      // 50-69 及格
  poor: '#EF4444',      // 0-49 需要练习
};

// 获取评分对应的颜色
export const getScoreColor = (score: number): string => {
  if (score >= 90) return ScoreColors.excellent;
  if (score >= 70) return ScoreColors.good;
  if (score >= 50) return ScoreColors.fair;
  return ScoreColors.poor;
};

// 获取评分对应的评价
export const getScoreFeedback = (score: number): string => {
  if (score >= 90) return '太棒了！🌟';
  if (score >= 70) return '很不错！👍';
  if (score >= 50) return '继续加油！💪';
  return '再练习一下！🎯';
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
