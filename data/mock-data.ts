// API 数据获取函数
// 从服务器获取实际数据

import { Cartoon, Season, Episode, DubbingClip } from '@/types';
import { API_ENDPOINTS } from '@/config/api';

// ===== API 调用函数 =====

// 辅助函数：从分页响应中提取数组
const extractItems = (data: any): any[] => {
  // 服务器可能返回 { items: [...], total, page, ... } 或直接返回数组
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
};

// 获取动画片列表
export const fetchCartoons = async (): Promise<Cartoon[]> => {
  try {
    const response = await fetch(API_ENDPOINTS.cartoons);
    if (!response.ok) throw new Error('获取动画片列表失败');
    const data = await response.json();
    return extractItems(data);
  } catch (error) {
    console.error('fetchCartoons error:', error);
    return [];
  }
};

// 获取动画片详情
export const fetchCartoon = async (id: string): Promise<Cartoon | null> => {
  try {
    const response = await fetch(API_ENDPOINTS.cartoon(id));
    if (!response.ok) throw new Error('获取动画片详情失败');
    return await response.json();
  } catch (error) {
    console.error('fetchCartoon error:', error);
    return null;
  }
};

// 获取季列表
export const fetchSeasons = async (cartoonId: string): Promise<Season[]> => {
  try {
    const response = await fetch(API_ENDPOINTS.seasons(cartoonId));
    if (!response.ok) throw new Error('获取季列表失败');
    const data = await response.json();
    return extractItems(data);
  } catch (error) {
    console.error('fetchSeasons error:', error);
    return [];
  }
};

// 获取集列表
export const fetchEpisodes = async (seasonId: string): Promise<Episode[]> => {
  try {
    const response = await fetch(API_ENDPOINTS.episodes(seasonId));
    if (!response.ok) throw new Error('获取集列表失败');
    const data = await response.json();
    return extractItems(data);
  } catch (error) {
    console.error('fetchEpisodes error:', error);
    return [];
  }
};

// 获取配音片段列表
export const fetchClips = async (seasonId: string, episodeName: string): Promise<DubbingClip[]> => {
  try {
    const response = await fetch(API_ENDPOINTS.clips(seasonId, episodeName));
    if (!response.ok) throw new Error('获取配音片段失败');
    const data = await response.json();
    return extractItems(data);
  } catch (error) {
    console.error('fetchClips error:', error);
    return [];
  }
};

// 获取单个配音片段（通过 clipPath）
export const fetchClipByPath = async (seasonId: string, episodeName: string, clipPath: string): Promise<DubbingClip | null> => {
  try {
    const clips = await fetchClips(seasonId, episodeName);
    return clips.find(c => c.clipPath === clipPath) || null;
  } catch (error) {
    console.error('fetchClipByPath error:', error);
    return null;
  }
};
