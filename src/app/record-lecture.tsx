import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/animated-pressable';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ingestLecture, type PickedFile } from '@/services/ingestion';
import { pickDocument } from '@/utils/pick-file';

const KEEP_AWAKE_TAG = 'record-lecture';

// Speech doesn't need audiophile quality, and a real lecture can run 50-90 minutes — a low
// mono bitrate keeps the file (and Files API upload time) small: ~14.4MB/hour vs. ~57.6MB/hour
// for the default HIGH_QUALITY stereo preset.
const LECTURE_RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 32000,
  },
};

type Phase = 'idle' | 'recording' | 'review' | 'generating';

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function defaultTitle() {
  return `Lecture — ${new Date().toLocaleDateString()}`;
}

export default function RecordLectureScreen() {
  const router = useRouter();
  const theme = useTheme();
  const recorder = useAudioRecorder(LECTURE_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 500);

  const [phase, setPhase] = useState<Phase>('idle');
  const [slides, setSlides] = useState<PickedFile | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const recorderStateRef = useRef(recorderState);
  recorderStateRef.current = recorderState;

  useEffect(() => {
    requestRecordingPermissionsAsync().then(({ granted }) => {
      if (!granted) {
        Alert.alert(
          'Microphone access needed',
          'Enable microphone access for Lumora in your device settings to record a lecture.'
        );
        router.back();
      }
    });
  }, [router]);

  // If the student backs out mid-recording, stop the native recording session and release the
  // keep-awake lock rather than leaving either dangling.
  useEffect(() => {
    return () => {
      if (recorderStateRef.current.isRecording) recorder.stop().catch(() => {});
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [recorder]);

  const handleStart = async () => {
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      allowsBackgroundRecording: true,
      interruptionMode: 'doNotMix',
    });
    await recorder.prepareToRecordAsync();
    recorder.record();
    await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    setPhase('recording');
  };

  const handlePauseResume = () => {
    if (recorderState.isRecording) {
      recorder.pause();
    } else {
      recorder.record();
    }
  };

  const handleStop = async () => {
    await recorder.stop();
    setPhase('review');
  };

  const handleAttachSlides = async () => {
    const file = await pickDocument();
    if (file) setSlides(file);
  };

  const handleGenerate = async () => {
    if (!recorder.uri) return;
    setPhase('generating');
    setGenerationError(null);
    try {
      const document = await ingestLecture(
        recorder.uri,
        'audio/mp4',
        title.trim() || defaultTitle(),
        slides ?? undefined
      );
      await deactivateKeepAwake(KEEP_AWAKE_TAG);
      router.replace({ pathname: '/document/[id]', params: { id: document.id } });
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Failed to generate study set.');
      setPhase('review');
    }
  };

  if (phase === 'generating') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centeredSafeArea}>
          <ActivityIndicator size="large" color={Brand.accent} />
          <ThemedText type="subtitle" style={styles.centeredText}>
            Generating your study set…
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centeredText}>
            Keep Lumora open until this finishes — it can take a few minutes for a long recording.
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.recordSection}>
            <AnimatedPressable
              onPress={phase === 'idle' ? handleStart : phase === 'recording' ? handlePauseResume : undefined}
              disabled={phase === 'review'}>
              <View
                style={[
                  styles.recordButton,
                  { backgroundColor: phase === 'recording' && recorderState.isRecording ? Brand.danger : Brand.accent },
                ]}>
                <Ionicons
                  name={
                    phase === 'idle'
                      ? 'mic'
                      : recorderState.isRecording
                        ? 'pause'
                        : 'play'
                  }
                  size={36}
                  color="#FFFFFF"
                />
              </View>
            </AnimatedPressable>
            <ThemedText type="subtitle">{formatElapsed(recorderState.durationMillis)}</ThemedText>
            <ThemedText themeColor="textSecondary">
              {phase === 'idle'
                ? 'Tap to start recording'
                : phase === 'recording'
                  ? recorderState.isRecording
                    ? 'Recording…'
                    : 'Paused'
                  : 'Recording stopped'}
            </ThemedText>

            {phase === 'recording' && (
              <AnimatedPressable onPress={handleStop}>
                <View style={styles.stopButton}>
                  <ThemedText type="smallBold" style={styles.stopButtonLabel}>
                    Stop
                  </ThemedText>
                </View>
              </AnimatedPressable>
            )}
          </View>

          <AnimatedPressable onPress={handleAttachSlides}>
            <ThemedView type="backgroundElement" style={styles.slidesRow}>
              <Ionicons name="document-attach-outline" size={20} color={theme.textSecondary} />
              <ThemedText type="smallBold" style={styles.slidesLabel}>
                {slides ? slides.name : 'Attach slides (optional)'}
              </ThemedText>
              {slides && (
                <AnimatedPressable onPress={() => setSlides(null)} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
                </AnimatedPressable>
              )}
            </ThemedView>
          </AnimatedPressable>

          {phase === 'review' && (
            <View style={styles.reviewSection}>
              <ThemedView type="backgroundElement" style={styles.titleInputWrap}>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Lecture title"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.titleInput, { color: theme.text }]}
                />
              </ThemedView>

              {generationError && <ThemedText style={styles.errorText}>{generationError}</ThemedText>}

              <AnimatedPressable onPress={handleGenerate}>
                <View style={styles.generateButton}>
                  <ThemedText type="smallBold" style={styles.generateButtonLabel}>
                    Generate study set
                  </ThemedText>
                </View>
              </AnimatedPressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  centeredSafeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.five,
  },
  centeredText: {
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
    gap: Spacing.four,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  recordSection: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  recordButton: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButton: {
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: Brand.danger,
  },
  stopButtonLabel: {
    color: '#FFFFFF',
  },
  slidesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
  },
  slidesLabel: {
    flex: 1,
  },
  reviewSection: {
    gap: Spacing.three,
  },
  titleInputWrap: {
    borderRadius: Radius.card,
  },
  titleInput: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  errorText: {
    color: Brand.danger,
    textAlign: 'center',
  },
  generateButton: {
    paddingVertical: Spacing.three,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.accent,
  },
  generateButtonLabel: {
    color: '#FFFFFF',
  },
});
