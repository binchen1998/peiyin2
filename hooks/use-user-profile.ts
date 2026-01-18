import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_PROFILE_KEY = '@user_profile';

export interface UserProfile {
  nickname: string;
  avatarUri: string | null;
  birthDate: string | null; // ISO date string
}

const defaultProfile: UserProfile = {
  nickname: '小小配音家',
  avatarUri: null,
  birthDate: null,
};

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [isLoading, setIsLoading] = useState(true);

  // 加载用户配置
  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const stored = await AsyncStorage.getItem(USER_PROFILE_KEY);
      if (stored) {
        setProfile(JSON.parse(stored));
      }
    } catch (error) {
      console.error('加载用户配置失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveProfile = async (newProfile: Partial<UserProfile>) => {
    try {
      const updated = { ...profile, ...newProfile };
      await AsyncStorage.setItem(USER_PROFILE_KEY, JSON.stringify(updated));
      setProfile(updated);
      return true;
    } catch (error) {
      console.error('保存用户配置失败:', error);
      return false;
    }
  };

  // 计算年龄
  const getAge = (): number | null => {
    if (!profile.birthDate) return null;
    
    const birth = new Date(profile.birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    return age;
  };

  return {
    profile,
    isLoading,
    saveProfile,
    getAge,
  };
}
