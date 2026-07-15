import { useAudioPlayer } from 'expo-audio';

/** Plays a short two-note chime, replayable from the start each time. */
export function useSuccessChime() {
  const player = useAudioPlayer(require('@/assets/sounds/correct-chime.wav'));

  return () => {
    player.seekTo(0).then(() => player.play());
  };
}
