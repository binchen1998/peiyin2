import { StyleSheet, View } from 'react-native';
import { Video, ResizeMode, Audio } from 'expo-av';
import { useRef, useEffect } from 'react';

interface VideoPlayerProps {
  uri: string;
  style?: any;
  autoPlay?: boolean;
}

export function VideoPlayer({ uri, style, autoPlay = true }: VideoPlayerProps) {
  const videoRef = useRef<Video>(null);

  // 组件卸载时释放资源并重置音频模式
  useEffect(() => {
    if (autoPlay && videoRef.current) {
      videoRef.current.playAsync().catch(() => {});
    }

    return () => {
      if (videoRef.current) {
        videoRef.current.stopAsync().catch(() => {});
        videoRef.current.unloadAsync().catch(() => {});
      }
      
      // 重置音频模式
      Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
      }).catch(() => {});
    };
  }, [autoPlay]);

  return (
    <Video
      ref={videoRef}
      source={{ uri }}
      style={[styles.video, style]}
      resizeMode={ResizeMode.CONTAIN}
      useNativeControls
      shouldPlay={autoPlay}
      isLooping={false}
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
