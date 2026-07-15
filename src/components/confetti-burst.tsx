import { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  BounceIn,
  Easing,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';

const COLORS = ['#FF6B6B', '#4D96FF', '#FFD93D', '#6BCB77', '#C780FA', '#FF9F45'];
const PIECE_COUNT = 14;

export function ConfettiBurst() {
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECE_COUNT }, (_, i) => {
        const angle = (Math.PI * 2 * i) / PIECE_COUNT + (Math.random() - 0.5) * 0.6;
        return {
          id: i,
          angle,
          distance: 46 + Math.random() * 46,
          spin: (Math.random() - 0.5) * 720,
          delay: Math.random() * 60,
          color: COLORS[i % COLORS.length],
          square: i % 2 === 0,
        };
      }),
    []
  );

  return (
    <Animated.View pointerEvents="none" exiting={FadeOut.duration(300)} style={styles.container}>
      <Animated.View entering={BounceIn.duration(450)}>
        <ThemedText style={styles.emoji}>🎉</ThemedText>
      </Animated.View>
      {pieces.map((piece) => (
        <ConfettiPiece key={piece.id} {...piece} />
      ))}
    </Animated.View>
  );
}

function ConfettiPiece({
  angle,
  distance,
  spin,
  delay,
  color,
  square,
}: {
  angle: number;
  distance: number;
  spin: number;
  delay: number;
  color: string;
  square: boolean;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: 720, easing: Easing.out(Easing.cubic) }));
  }, [delay, progress]);

  const style = useAnimatedStyle(() => {
    const eased = progress.value;
    const dx = Math.cos(angle) * distance * eased;
    const dy = Math.sin(angle) * distance * eased + 24 * eased * eased;
    return {
      opacity: 1 - eased,
      transform: [
        { translateX: dx },
        { translateY: dy },
        { rotate: `${spin * eased}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.piece,
        { backgroundColor: color, borderRadius: square ? 2 : 6 },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  emoji: {
    fontSize: 52,
    lineHeight: 64,
  },
  piece: {
    position: 'absolute',
    width: 8,
    height: 8,
  },
});
