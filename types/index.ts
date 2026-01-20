// 动画片数据类型定义

export interface Cartoon {
  id: string;
  name: string;
  nameCN: string;
  thumbnail: string | null;
  description: string | null;
}

export interface Season {
  id: string;
  number: number;
  cartoonId: string;
  allJsonUrl: string | null;  // all.json 的 URL
}

// 从 all.json 获取的集信息
export interface Episode {
  id: number;  // 在 all.json 中的序号
  name: string;  // 目录名称
  seasonId: string;
  title: string | null;
  titleCN: string | null;
  thumbnail: string | null;
}

// 从单集 JSON 获取的配音片段
export interface DubbingClip {
  clipPath: string;  // 完整路径，如 "CE001 Muddy Puddles/clips/clip_1.mp4"
  videoUrl: string;
  originalText: string;
  translationCN: string | null;
  thumbnail: string | null;
  duration: number;
}

// 首页推荐片段
export interface RecommendedClip {
  id: number;
  seasonId: string;
  episodeName: string;
  clipPath: string;
  videoUrl: string;
  thumbnail: string | null;
  originalText: string;
  translationCN: string | null;
  duration: number;
}

// 评分结果
export interface ScoringResult {
  overallScore: number;
  phonemeScores: PhonemeScore[];
  wordScores: WordScore[];
  feedback: string;
}

export interface PhonemeScore {
  phoneme: string;
  score: number;
  startTime: number;
  endTime: number;
}

export interface WordScore {
  word: string;
  score: number;
  phonemes: PhonemeScore[];
}

// 用户配音记录
export interface DubbingRecord {
  id: string;
  clipPath: string;
  userId: string;
  audioUrl: string;
  score: number;
  scoringResult: ScoringResult;
  createdAt: string;
}

// 用户学习统计
export interface UserLearningStats {
  dubbingCount: number;
  averageScore: number;
  learningDays: number;
}
