import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

interface VideoPlayerProps {
  uri: string;
  style?: any;
  autoPlay?: boolean;
}

export function VideoPlayer({ uri, style, autoPlay = true }: VideoPlayerProps) {
  const player = useVideoPlayer(uri, player => {
    player.loop = false;
    if (autoPlay) {
      player.play();
    }
  });

  useEffect(() => {
    console.log('VideoPlayer 加载视频:', uri);
  }, [uri]);

  return (
    <VideoView
      style={[styles.video, style]}
      player={player}
      allowsFullscreen
      allowsPictureInPicture
      nativeControls
    />
  );
}

const styles = StyleSheet.create({
  video: {
    width: '100%',
    height: 200,
    backgroundColor: '#000',
  },
});
