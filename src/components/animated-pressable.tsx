import { forwardRef } from 'react';
import { Pressable, type PressableProps, type View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const ReanimatedPressable = Animated.createAnimatedComponent(Pressable);

export const AnimatedPressable = forwardRef<View, PressableProps>(function AnimatedPressable(
  { style, onPressIn, onPressOut, ...rest },
  ref
) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <ReanimatedPressable
      ref={ref}
      style={[animatedStyle, style as object]}
      onPressIn={(event) => {
        scale.value = withSpring(0.95, { damping: 20, stiffness: 500, mass: 0.5 });
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withSpring(1, { damping: 20, stiffness: 500, mass: 0.5 });
        onPressOut?.(event);
      }}
      {...rest}
    />
  );
});
