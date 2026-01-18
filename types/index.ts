// 动画片数据类型定义

export interface Cartoon {
  id: string;
  name: string;
  nameCN: string;
  thumbnail: string;
  description: string;
  seasons: Season[];
}

export interface Season {
  id: string;
  number: number;
  cartoonId: string;
  episodes: Episode[];
}

export interface Episode {
  id: string;
  number: number;
  title: string;
  titleCN: string;
  thumbnail: string;
  seasonId: string;
  dubbingClips: DubbingClip[];
}

export interface DubbingClip {
  id: string;
  episodeId: string;
  order: number;
  videoUrl: string;
  originalText: string;
  translationCN: string;
  startTime: number;
  endTime: number;
  character: string;
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
  clipId: string;
  userId: string;
  audioUrl: string;
  score: number;
  scoringResult: ScoringResult;
  createdAt: string;
}
