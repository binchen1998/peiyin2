// 模拟数据 - 实际项目中应从服务器获取
import { Cartoon, Season, Episode, DubbingClip } from '@/types';

export const mockCartoons: Cartoon[] = [
  {
    id: 'peppa-pig',
    name: 'Peppa Pig',
    nameCN: '小猪佩奇',
    thumbnail: 'https://picsum.photos/seed/peppa/300/200',
    description: 'A lovely pig family story',
    seasons: [],
  },
  {
    id: 'paw-patrol',
    name: 'PAW Patrol',
    nameCN: '汪汪队立大功',
    thumbnail: 'https://picsum.photos/seed/paw/300/200',
    description: 'Brave puppies save the day',
    seasons: [],
  },
  {
    id: 'frozen',
    name: 'Frozen',
    nameCN: '冰雪奇缘',
    thumbnail: 'https://picsum.photos/seed/frozen/300/200',
    description: 'A magical winter adventure',
    seasons: [],
  },
  {
    id: 'toy-story',
    name: 'Toy Story',
    nameCN: '玩具总动员',
    thumbnail: 'https://picsum.photos/seed/toy/300/200',
    description: 'Toys come alive when you are not looking',
    seasons: [],
  },
  {
    id: 'finding-nemo',
    name: 'Finding Nemo',
    nameCN: '海底总动员',
    thumbnail: 'https://picsum.photos/seed/nemo/300/200',
    description: 'An ocean adventure to find a little fish',
    seasons: [],
  },
  {
    id: 'minions',
    name: 'Minions',
    nameCN: '小黄人',
    thumbnail: 'https://picsum.photos/seed/minions/300/200',
    description: 'Funny yellow creatures',
    seasons: [],
  },
];

// 生成季节数据
export const mockSeasons: Record<string, Season[]> = {
  'peppa-pig': [
    { id: 'peppa-s1', number: 1, cartoonId: 'peppa-pig', episodes: [] },
    { id: 'peppa-s2', number: 2, cartoonId: 'peppa-pig', episodes: [] },
    { id: 'peppa-s3', number: 3, cartoonId: 'peppa-pig', episodes: [] },
  ],
  'paw-patrol': [
    { id: 'paw-s1', number: 1, cartoonId: 'paw-patrol', episodes: [] },
    { id: 'paw-s2', number: 2, cartoonId: 'paw-patrol', episodes: [] },
  ],
  'frozen': [
    { id: 'frozen-s1', number: 1, cartoonId: 'frozen', episodes: [] },
  ],
  'toy-story': [
    { id: 'toy-s1', number: 1, cartoonId: 'toy-story', episodes: [] },
    { id: 'toy-s2', number: 2, cartoonId: 'toy-story', episodes: [] },
  ],
  'finding-nemo': [
    { id: 'nemo-s1', number: 1, cartoonId: 'finding-nemo', episodes: [] },
  ],
  'minions': [
    { id: 'minions-s1', number: 1, cartoonId: 'minions', episodes: [] },
  ],
};

// 生成剧集数据
export const mockEpisodes: Record<string, Episode[]> = {
  'peppa-s1': [
    { id: 'peppa-s1-e1', number: 1, title: 'Muddy Puddles', titleCN: '泥坑', thumbnail: 'https://picsum.photos/seed/peppa1/300/200', seasonId: 'peppa-s1', dubbingClips: [] },
    { id: 'peppa-s1-e2', number: 2, title: 'Mr Dinosaur is Lost', titleCN: '恐龙先生不见了', thumbnail: 'https://picsum.photos/seed/peppa2/300/200', seasonId: 'peppa-s1', dubbingClips: [] },
    { id: 'peppa-s1-e3', number: 3, title: 'Best Friend', titleCN: '最好的朋友', thumbnail: 'https://picsum.photos/seed/peppa3/300/200', seasonId: 'peppa-s1', dubbingClips: [] },
    { id: 'peppa-s1-e4', number: 4, title: 'Polly Parrot', titleCN: '鹦鹉波莉', thumbnail: 'https://picsum.photos/seed/peppa4/300/200', seasonId: 'peppa-s1', dubbingClips: [] },
    { id: 'peppa-s1-e5', number: 5, title: 'Hide and Seek', titleCN: '捉迷藏', thumbnail: 'https://picsum.photos/seed/peppa5/300/200', seasonId: 'peppa-s1', dubbingClips: [] },
  ],
  'peppa-s2': [
    { id: 'peppa-s2-e1', number: 1, title: 'Bubbles', titleCN: '泡泡', thumbnail: 'https://picsum.photos/seed/peppa6/300/200', seasonId: 'peppa-s2', dubbingClips: [] },
    { id: 'peppa-s2-e2', number: 2, title: 'Emily Elephant', titleCN: '大象艾米丽', thumbnail: 'https://picsum.photos/seed/peppa7/300/200', seasonId: 'peppa-s2', dubbingClips: [] },
    { id: 'peppa-s2-e3', number: 3, title: 'The Tooth Fairy', titleCN: '牙仙子', thumbnail: 'https://picsum.photos/seed/peppa8/300/200', seasonId: 'peppa-s2', dubbingClips: [] },
  ],
  'peppa-s3': [
    { id: 'peppa-s3-e1', number: 1, title: 'Work and Play', titleCN: '工作和玩耍', thumbnail: 'https://picsum.photos/seed/peppa9/300/200', seasonId: 'peppa-s3', dubbingClips: [] },
    { id: 'peppa-s3-e2', number: 2, title: 'The Rainbow', titleCN: '彩虹', thumbnail: 'https://picsum.photos/seed/peppa10/300/200', seasonId: 'peppa-s3', dubbingClips: [] },
  ],
  'paw-s1': [
    { id: 'paw-s1-e1', number: 1, title: 'Pups Make a Splash', titleCN: '狗狗们溅起水花', thumbnail: 'https://picsum.photos/seed/paw1/300/200', seasonId: 'paw-s1', dubbingClips: [] },
    { id: 'paw-s1-e2', number: 2, title: 'Pups Save the Sea Turtles', titleCN: '狗狗们救海龟', thumbnail: 'https://picsum.photos/seed/paw2/300/200', seasonId: 'paw-s1', dubbingClips: [] },
    { id: 'paw-s1-e3', number: 3, title: 'Pups and the Kitty-tastrophe', titleCN: '狗狗和小猫灾难', thumbnail: 'https://picsum.photos/seed/paw3/300/200', seasonId: 'paw-s1', dubbingClips: [] },
  ],
  'paw-s2': [
    { id: 'paw-s2-e1', number: 1, title: 'Pups Save a Dolphin', titleCN: '狗狗们救海豚', thumbnail: 'https://picsum.photos/seed/paw4/300/200', seasonId: 'paw-s2', dubbingClips: [] },
    { id: 'paw-s2-e2', number: 2, title: 'Pups Save the Space Alien', titleCN: '狗狗们救外星人', thumbnail: 'https://picsum.photos/seed/paw5/300/200', seasonId: 'paw-s2', dubbingClips: [] },
  ],
  'frozen-s1': [
    { id: 'frozen-s1-e1', number: 1, title: 'Let It Go', titleCN: '随它吧', thumbnail: 'https://picsum.photos/seed/frozen1/300/200', seasonId: 'frozen-s1', dubbingClips: [] },
    { id: 'frozen-s1-e2', number: 2, title: 'Do You Want to Build a Snowman', titleCN: '你想堆雪人吗', thumbnail: 'https://picsum.photos/seed/frozen2/300/200', seasonId: 'frozen-s1', dubbingClips: [] },
  ],
  'toy-s1': [
    { id: 'toy-s1-e1', number: 1, title: 'Woody and Buzz', titleCN: '胡迪和巴斯', thumbnail: 'https://picsum.photos/seed/toy1/300/200', seasonId: 'toy-s1', dubbingClips: [] },
    { id: 'toy-s1-e2', number: 2, title: 'The Claw', titleCN: '爪子', thumbnail: 'https://picsum.photos/seed/toy2/300/200', seasonId: 'toy-s1', dubbingClips: [] },
  ],
  'toy-s2': [
    { id: 'toy-s2-e1', number: 1, title: 'To Infinity and Beyond', titleCN: '飞向无限', thumbnail: 'https://picsum.photos/seed/toy3/300/200', seasonId: 'toy-s2', dubbingClips: [] },
  ],
  'nemo-s1': [
    { id: 'nemo-s1-e1', number: 1, title: 'Just Keep Swimming', titleCN: '继续游泳', thumbnail: 'https://picsum.photos/seed/nemo1/300/200', seasonId: 'nemo-s1', dubbingClips: [] },
    { id: 'nemo-s1-e2', number: 2, title: 'Finding Dory', titleCN: '寻找多莉', thumbnail: 'https://picsum.photos/seed/nemo2/300/200', seasonId: 'nemo-s1', dubbingClips: [] },
  ],
  'minions-s1': [
    { id: 'minions-s1-e1', number: 1, title: 'Banana', titleCN: '香蕉', thumbnail: 'https://picsum.photos/seed/minions1/300/200', seasonId: 'minions-s1', dubbingClips: [] },
    { id: 'minions-s1-e2', number: 2, title: 'Kevin and Bob', titleCN: '凯文和鲍勃', thumbnail: 'https://picsum.photos/seed/minions2/300/200', seasonId: 'minions-s1', dubbingClips: [] },
  ],
};

// 生成配音片段数据
export const mockDubbingClips: Record<string, DubbingClip[]> = {
  'peppa-s1-e1': [
    {
      id: 'clip-1',
      episodeId: 'peppa-s1-e1',
      order: 1,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      originalText: 'I am Peppa Pig.',
      translationCN: '我是小猪佩奇。',
      startTime: 0,
      endTime: 3,
      character: 'Peppa',
    },
    {
      id: 'clip-2',
      episodeId: 'peppa-s1-e1',
      order: 2,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      originalText: 'This is my little brother George.',
      translationCN: '这是我的弟弟乔治。',
      startTime: 3,
      endTime: 6,
      character: 'Peppa',
    },
    {
      id: 'clip-3',
      episodeId: 'peppa-s1-e1',
      order: 3,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      originalText: 'I love jumping in muddy puddles!',
      translationCN: '我喜欢在泥坑里跳！',
      startTime: 6,
      endTime: 10,
      character: 'Peppa',
    },
  ],
  'peppa-s1-e2': [
    {
      id: 'clip-4',
      episodeId: 'peppa-s1-e2',
      order: 1,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      originalText: 'Where is Mr Dinosaur?',
      translationCN: '恐龙先生在哪里？',
      startTime: 0,
      endTime: 3,
      character: 'George',
    },
    {
      id: 'clip-5',
      episodeId: 'peppa-s1-e2',
      order: 2,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      originalText: 'Do not worry George, we will find him.',
      translationCN: '别担心乔治，我们会找到他的。',
      startTime: 3,
      endTime: 6,
      character: 'Peppa',
    },
  ],
  'peppa-s1-e3': [
    {
      id: 'clip-6',
      episodeId: 'peppa-s1-e3',
      order: 1,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      originalText: 'Hello, my name is Peppa.',
      translationCN: '你好，我叫佩奇。',
      startTime: 0,
      endTime: 3,
      character: 'Peppa',
    },
  ],
  'paw-s1-e1': [
    {
      id: 'clip-7',
      episodeId: 'paw-s1-e1',
      order: 1,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      originalText: 'No job is too big, no pup is too small!',
      translationCN: '没有什么任务太大，没有什么狗狗太小！',
      startTime: 0,
      endTime: 4,
      character: 'Ryder',
    },
    {
      id: 'clip-8',
      episodeId: 'paw-s1-e1',
      order: 2,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      originalText: 'PAW Patrol is on a roll!',
      translationCN: '汪汪队出动！',
      startTime: 4,
      endTime: 7,
      character: 'All',
    },
  ],
  'frozen-s1-e1': [
    {
      id: 'clip-9',
      episodeId: 'frozen-s1-e1',
      order: 1,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      originalText: 'Let it go, let it go!',
      translationCN: '随它吧，随它吧！',
      startTime: 0,
      endTime: 4,
      character: 'Elsa',
    },
    {
      id: 'clip-10',
      episodeId: 'frozen-s1-e1',
      order: 2,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      originalText: 'The cold never bothered me anyway.',
      translationCN: '寒冷从来不会困扰我。',
      startTime: 4,
      endTime: 8,
      character: 'Elsa',
    },
  ],
};

// 获取动画片列表
export const getCartoons = (): Cartoon[] => mockCartoons;

// 获取动画片详情
export const getCartoon = (id: string): Cartoon | undefined => 
  mockCartoons.find(c => c.id === id);

// 获取季节列表
export const getSeasons = (cartoonId: string): Season[] => 
  mockSeasons[cartoonId] || [];

// 获取剧集列表
export const getEpisodes = (seasonId: string): Episode[] => 
  mockEpisodes[seasonId] || [];

// 获取配音片段列表
export const getDubbingClips = (episodeId: string): DubbingClip[] => 
  mockDubbingClips[episodeId] || [];

// 获取单个配音片段
export const getDubbingClip = (clipId: string): DubbingClip | undefined => {
  for (const clips of Object.values(mockDubbingClips)) {
    const clip = clips.find(c => c.id === clipId);
    if (clip) return clip;
  }
  return undefined;
};
