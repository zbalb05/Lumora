import { LinearGradient } from 'expo-linear-gradient';
import * as Speech from 'expo-speech';
import { useLocalSearchParams, useFocusEffect, Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  runOnJS,
  SlideOutLeft,
  SlideOutRight,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/animated-pressable';
import { BionicText } from '@/components/bionic-text';
import { ConfettiBurst } from '@/components/confetti-burst';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BadgeColors, Brand, MaxContentWidth, Radius, Spacing, TabBarHeight } from '@/constants/theme';
import { logActivity } from '@/db/queries/activity';
import { getDocument, markFlashcardsCompleted } from '@/db/queries/documents';
import { listFlashcardsByDocument, reviewFlashcard } from '@/db/queries/flashcards';
import { getNoteByDocument } from '@/db/queries/notes';
import { completeQuiz, getQuizByDocument } from '@/db/queries/quizzes';
import type { documents, flashcards, notes } from '@/db/schema';
import type { getQuizByDocument as getQuizByDocumentType } from '@/db/queries/quizzes';
import { useSuccessChime } from '@/hooks/use-success-chime';
import { useTheme } from '@/hooks/use-theme';
import { pullRemoteChanges, pushPendingChanges } from '@/services/sync';
import { markdownToPlainText } from '@/utils/bionic';
import { keepSourceTagsOnOneLine, stripMarkdownEmphasis } from '@/utils/markdown';

type DocumentRow = typeof documents.$inferSelect;
type NoteRow = typeof notes.$inferSelect;
type FlashcardRow = typeof flashcards.$inferSelect;
type QuizRow = Awaited<ReturnType<typeof getQuizByDocumentType>>;
type QuizQuestionRow = NonNullable<QuizRow>['questions'][number];

type Tab = 'notes' | 'flashcards' | 'quiz';

export default function DocumentWorkspaceScreen() {
  const insets = useSafeAreaInsets();
  const { id, tab: initialTab } = useLocalSearchParams<{ id: string; tab?: Tab }>();
  const [document, setDocument] = useState<DocumentRow>();
  const [note, setNote] = useState<NoteRow>();
  const [cards, setCards] = useState<FlashcardRow[]>([]);
  const [quiz, setQuiz] = useState<QuizRow>();
  const [tab, setTab] = useState<Tab>(
    initialTab === 'flashcards' || initialTab === 'quiz' ? initialTab : 'notes'
  );
  const [showQuizBurst, setShowQuizBurst] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const triggerQuizBurst = () => {
    setShowQuizBurst(true);
    setTimeout(() => setShowQuizBurst(false), 900);
  };

  const loadData = useCallback(async () => {
    const [doc, n, c, q] = await Promise.all([
      getDocument(id),
      getNoteByDocument(id),
      listFlashcardsByDocument(id),
      getQuizByDocument(id),
    ]);
    setDocument(doc);
    setNote(n);
    setCards(c);
    setQuiz(q);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await pushPendingChanges();
    await pullRemoteChanges();
    await loadData();
    setRefreshing(false);
  };

  if (!document) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (document.status !== 'ready') {
    return (
      <ThemedView style={styles.centered}>
        <Stack.Screen options={{ title: document.title }} />
        {document.status === 'error' ? (
          <ThemedText themeColor="textSecondary">{document.errorMessage}</ThemedText>
        ) : (
          <>
            <ActivityIndicator />
            <ThemedText themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
              Generating notes, flashcards & quiz…
            </ThemedText>
          </>
        )}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: document.title }} />
      {showQuizBurst && <ConfettiBurst />}
      <View style={styles.tabBar}>
        {(['notes', 'flashcards', 'quiz'] as const).map((t) => (
          <AnimatedPressable key={t} onPress={() => setTab(t)} style={styles.tabItem}>
            <ThemedText
              type="smallBold"
              themeColor={tab === t ? 'text' : 'textSecondary'}
              style={styles.tabLabel}>
              {t === 'notes' ? 'Notes' : t === 'flashcards' ? 'Flashcards' : 'Quiz'}
            </ThemedText>
          </AnimatedPressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Spacing.four + TabBarHeight + insets.bottom },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Brand.accent}
            colors={[Brand.accent]}
          />
        }>
        <Animated.View key={tab} entering={FadeIn.duration(200)}>
          {tab === 'notes' && <NotesView markdown={note?.markdown ?? ''} />}
          {tab === 'flashcards' && (
            <FlashcardsView
              documentId={document.id}
              completedAt={document.flashcardsCompletedAt}
              cards={cards}
              onCompleted={loadData}
            />
          )}
          {tab === 'quiz' && (
            <QuizView quiz={quiz} onCorrectAnswer={triggerQuizBurst} onCompleted={loadData} />
          )}
        </Animated.View>
      </ScrollView>
    </ThemedView>
  );
}

function NotesView({ markdown }: { markdown: string }) {
  const [bionic, setBionic] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  const toggleListen = () => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(markdownToPlainText(markdown), {
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  const lines = markdown.split('\n');

  return (
    <View style={{ gap: Spacing.three }}>
      <View style={styles.notesToolbar}>
        <AnimatedPressable onPress={() => setBionic((v) => !v)}>
          <ThemedView type={bionic ? 'backgroundSelected' : 'backgroundElement'} style={styles.toolbarButton}>
            <ThemedText type="small">Bionic reading</ThemedText>
          </ThemedView>
        </AnimatedPressable>
        <AnimatedPressable onPress={toggleListen}>
          <ThemedView type={speaking ? 'backgroundSelected' : 'backgroundElement'} style={styles.toolbarButton}>
            <ThemedText type="small">{speaking ? 'Stop' : 'Listen'}</ThemedText>
          </ThemedView>
        </AnimatedPressable>
      </View>

      <View style={{ gap: Spacing.two }}>
        {lines.map((line, i) => {
          if (line.startsWith('### ')) {
            const heading = keepSourceTagsOnOneLine(stripMarkdownEmphasis(line.replace(/^###\s*/, '')));
            return (
              <ThemedText key={i} type="smallBold" style={{ marginTop: Spacing.two }}>
                {bionic ? <BionicText text={heading} /> : heading}
              </ThemedText>
            );
          }
          if (/^\s*[-*]\s/.test(line)) {
            const bullet = keepSourceTagsOnOneLine(stripMarkdownEmphasis(line.replace(/^\s*[-*]\s*/, '')));
            return bionic ? (
              <View key={i} style={{ flexDirection: 'row', paddingLeft: Spacing.two, gap: Spacing.one }}>
                <ThemedText>•</ThemedText>
                <BionicText text={bullet} style={{ flexShrink: 1 }} />
              </View>
            ) : (
              <ThemedText key={i} style={{ paddingLeft: Spacing.two }}>
                • {bullet}
              </ThemedText>
            );
          }
          if (line.trim().length === 0) return null;
          const plain = keepSourceTagsOnOneLine(stripMarkdownEmphasis(line));
          return bionic ? <BionicText key={i} text={plain} /> : <ThemedText key={i}>{plain}</ThemedText>;
        })}
      </View>
    </View>
  );
}

const MIN_FLASHCARD_HEIGHT = 380;
const MAX_FLASHCARD_HEIGHT = 640;
const ANSWER_GRADIENT: [string, string] = ['#22C55E', '#15803D'];

function FlashcardsView({
  documentId,
  completedAt,
  cards,
  onCompleted,
}: {
  documentId: string;
  completedAt: string | null;
  cards: FlashcardRow[];
  onCompleted: () => void;
}) {
  const theme = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const cardHeight = Math.min(
    MAX_FLASHCARD_HEIGHT,
    Math.max(MIN_FLASHCARD_HEIGHT, windowHeight * 0.62)
  );
  const [index, setIndex] = useState(0);
  const [exitSide, setExitSide] = useState<'left' | 'right'>('left');
  const [reviewing, setReviewing] = useState(completedAt === null);

  if (cards.length === 0) {
    return <ThemedText themeColor="textSecondary">No flashcards yet.</ThemedText>;
  }

  const restart = () => {
    setIndex(0);
    setReviewing(true);
  };

  if (!reviewing) {
    return (
      <Animated.View entering={FadeIn.duration(220)} style={styles.doneState}>
        <ThemedText style={styles.doneEmoji}>✅</ThemedText>
        <ThemedText type="subtitle">Deck completed</ThemedText>
        <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
          You finished all {cards.length} cards
          {completedAt ? ` on ${new Date(completedAt).toLocaleDateString()}` : ''}.
        </ThemedText>
        <AnimatedPressable onPress={restart} style={styles.doneRestartButton}>
          <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>
            Study again
          </ThemedText>
        </AnimatedPressable>
      </Animated.View>
    );
  }

  if (index >= cards.length) {
    return (
      <Animated.View entering={FadeIn.duration(220)} style={styles.doneState}>
        <ThemedText style={styles.doneEmoji}>🎉</ThemedText>
        <ThemedText type="subtitle">All caught up!</ThemedText>
        <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
          You’ve reviewed every flashcard in this set.
        </ThemedText>
        <AnimatedPressable onPress={restart} style={styles.doneRestartButton}>
          <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>
            Study again
          </ThemedText>
        </AnimatedPressable>
      </Animated.View>
    );
  }

  const card = cards[index];
  const hasNext = index + 1 < cards.length;

  const grade = async (remembered: boolean) => {
    setExitSide(remembered ? 'right' : 'left');
    await reviewFlashcard(card.id, remembered);
    await logActivity('flashcard_reviewed', { flashcardId: card.id, remembered });
    const nextIndex = index + 1;
    setIndex(nextIndex);
    if (nextIndex >= cards.length) {
      await markFlashcardsCompleted(documentId);
      onCompleted();
    }
  };

  return (
    <View style={{ gap: Spacing.four }}>
      <View style={styles.progressHeader}>
        <View style={styles.cardCounterRow}>
          <ThemedText type="smallBold">
            Card {index + 1} of {cards.length}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {Math.round((index / cards.length) * 100)}% done
          </ThemedText>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${(index / cards.length) * 100}%`, backgroundColor: Brand.accent },
            ]}
          />
        </View>
      </View>

      <View style={styles.stackArea}>
        {hasNext && (
          <ThemedView
            type="backgroundElement"
            style={[styles.decoyCard, styles.decoyCardFar, { top: cardHeight + 18 }]}
          />
        )}
        {hasNext && (
          <ThemedView
            type="backgroundElement"
            style={[styles.decoyCard, styles.decoyCardNear, { top: cardHeight + 7 }]}
          />
        )}
        <Animated.View
          key={card.id}
          entering={FadeIn.duration(220)}
          exiting={(exitSide === 'right' ? SlideOutRight : SlideOutLeft).duration(260)}>
          <FlashcardStackCard card={card} height={cardHeight} onGrade={grade} />
        </Animated.View>
      </View>

      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        Tap the card to reveal the answer, then mark Got it or Missed.
      </ThemedText>
    </View>
  );
}

function FlashcardStackCard({
  card,
  height,
  onGrade,
}: {
  card: FlashcardRow;
  height: number;
  onGrade: (remembered: boolean) => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const [displaySide, setDisplaySide] = useState<'front' | 'back'>('front');
  const rotation = useSharedValue(0);
  const isAnswer = displaySide === 'back';

  const commitGrade = (remembered: boolean) => {
    onGrade(remembered);
  };

  const flip = () => {
    if (flipped) return;
    setFlipped(true);
    rotation.value = withTiming(90, { duration: 140, easing: Easing.in(Easing.cubic) }, (finished) => {
      'worklet';
      if (finished) {
        runOnJS(setDisplaySide)('back');
        rotation.value = -90;
        rotation.value = withTiming(0, { duration: 140, easing: Easing.out(Easing.cubic) });
      }
    });
  };

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 800 }, { rotateY: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={cardStyle}>
      <AnimatedPressable onPress={flip} disabled={flipped}>
        <ThemedView type="backgroundElement" style={[styles.flashcard, { height }]}>
          <LinearGradient
            colors={isAnswer ? ANSWER_GRADIENT : Brand.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.flashcardHeader}>
            <View style={styles.flashcardKickerChip}>
              <ThemedText type="small" style={styles.onAccentBold}>
                {isAnswer ? '✅ ANSWER' : '❓ QUESTION'}
              </ThemedText>
            </View>
          </LinearGradient>
          <ScrollView
            style={styles.flashcardScroll}
            contentContainerStyle={styles.flashcardScrollContent}
            showsVerticalScrollIndicator={false}>
            <ThemedText style={styles.flashcardMain}>
              {isAnswer ? card.back : card.front}
            </ThemedText>
          </ScrollView>
          {!flipped && (
            <View style={styles.flashcardHintPill}>
              <ThemedText type="small" themeColor="textSecondary">
                👆 Tap to reveal
              </ThemedText>
            </View>
          )}
        </ThemedView>
      </AnimatedPressable>

      {flipped && (
        <View style={styles.gradeRow}>
          <AnimatedPressable style={styles.gradeButtonFlex} onPress={() => commitGrade(false)} hitSlop={8}>
            <View style={[styles.gradeButton, { backgroundColor: BadgeColors.pink.bg }]}>
              <ThemedText style={[styles.gradeButtonIcon, { color: BadgeColors.pink.fg }]}>✕</ThemedText>
              <ThemedText type="smallBold" style={{ color: BadgeColors.pink.fg }}>
                Missed
              </ThemedText>
            </View>
          </AnimatedPressable>
          <AnimatedPressable style={styles.gradeButtonFlex} onPress={() => commitGrade(true)} hitSlop={8}>
            <View style={[styles.gradeButton, { backgroundColor: BadgeColors.green.bg }]}>
              <ThemedText style={[styles.gradeButtonIcon, { color: BadgeColors.green.fg }]}>✓</ThemedText>
              <ThemedText type="smallBold" style={{ color: BadgeColors.green.fg }}>
                Got it
              </ThemedText>
            </View>
          </AnimatedPressable>
        </View>
      )}
    </Animated.View>
  );
}

type QuizStage = 'start' | 'active' | 'result';

function formatClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function QuizView({
  quiz,
  onCorrectAnswer,
  onCompleted,
}: {
  quiz: QuizRow;
  onCorrectAnswer: () => void;
  onCompleted: () => void;
}) {
  const [stage, setStage] = useState<QuizStage>('start');
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [answerTimes, setAnswerTimes] = useState<Record<string, number>>({});
  const [elapsedMs, setElapsedMs] = useState(0);
  const startTimeRef = useRef(0);
  const questionStartRef = useRef(0);
  const loggedRef = useRef(false);
  const playChime = useSuccessChime();

  useEffect(() => {
    if (stage !== 'active') return;
    const interval = setInterval(() => setElapsedMs(Date.now() - startTimeRef.current), 500);
    return () => clearInterval(interval);
  }, [stage]);

  if (!quiz || quiz.questions.length === 0) {
    return <ThemedText themeColor="textSecondary">No quiz yet.</ThemedText>;
  }

  const questions = quiz.questions;
  const total = questions.length;
  const question = questions[qIndex];
  const correctCount = questions.filter((q) => selected[q.id] === q.correctChoiceIndex).length;

  const startQuiz = () => {
    setStage('active');
    setQIndex(0);
    setSelected({});
    setAnswerTimes({});
    loggedRef.current = false;
    startTimeRef.current = Date.now();
    questionStartRef.current = Date.now();
    setElapsedMs(0);
  };

  const selectChoice = (choiceIndex: number) => {
    if (selected[question.id] !== undefined) return;
    const timeTaken = Date.now() - questionStartRef.current;
    setSelected((prev) => ({ ...prev, [question.id]: choiceIndex }));
    setAnswerTimes((prev) => ({ ...prev, [question.id]: timeTaken }));
    if (choiceIndex === question.correctChoiceIndex) {
      playChime();
      onCorrectAnswer();
    }
  };

  const finishQuiz = () => {
    setStage('result');
    if (!loggedRef.current) {
      loggedRef.current = true;
      logActivity('quiz_taken', { quizId: quiz.id, correctCount, total });
      completeQuiz(quiz.id, correctCount).then(onCompleted);
    }
  };

  const goNext = () => {
    if (qIndex + 1 < total) {
      setQIndex((i) => i + 1);
      questionStartRef.current = Date.now();
    } else {
      finishQuiz();
    }
  };

  const goPrevious = () => {
    if (qIndex > 0) setQIndex((i) => i - 1);
  };

  if (stage === 'start') {
    return (
      <QuizStartScreen
        total={total}
        title={quiz.title}
        completedAt={quiz.completedAt}
        lastCorrectCount={quiz.lastCorrectCount}
        onStart={startQuiz}
      />
    );
  }

  if (stage === 'result') {
    const totalTimeMs = Object.values(answerTimes).reduce((a, b) => a + b, 0);
    const avgTimeMs = total > 0 ? totalTimeMs / total : 0;
    return (
      <QuizResultScreen
        correctCount={correctCount}
        total={total}
        totalTimeMs={totalTimeMs}
        avgTimeMs={avgTimeMs}
        onRetry={startQuiz}
      />
    );
  }

  return (
    <QuizActiveScreen
      question={question}
      index={qIndex}
      total={total}
      elapsedMs={elapsedMs}
      selectedChoice={selected[question.id]}
      onSelect={selectChoice}
      onNext={goNext}
      onPrevious={goPrevious}
      canGoPrevious={qIndex > 0}
      isLast={qIndex === total - 1}
    />
  );
}

/** Vertically centers quiz content in roughly two-thirds of the screen height, so each stage
 * (start/active/result) reads as a focused full screen rather than a small card in a long list. */
function QuizScreenFrame({ children }: { children: ReactNode }) {
  const { height: windowHeight } = useWindowDimensions();
  const minHeight = Math.max(420, windowHeight * 0.6);
  return <View style={[quizStyles.frame, { minHeight }]}>{children}</View>;
}

function QuizStartScreen({
  total,
  title,
  completedAt,
  lastCorrectCount,
  onStart,
}: {
  total: number;
  title: string;
  completedAt: string | null;
  lastCorrectCount: number | null;
  onStart: () => void;
}) {
  const isCompleted = completedAt !== null;
  return (
    <QuizScreenFrame>
      <Animated.View entering={FadeIn.duration(220)}>
        <ThemedView type="backgroundElement" style={quizStyles.card}>
          <ThemedText themeColor="textSecondary">
            {isCompleted ? '✅ You’ve completed this quiz' : 'Put your understanding of this content to the test.'}
          </ThemedText>
          <View style={quizStyles.startBanner}>
            <ThemedText type="subtitle" style={quizStyles.onAccent} numberOfLines={3}>
              {title}
            </ThemedText>
          </View>
          {isCompleted ? (
            <ThemedText>
              Last score:{' '}
              <ThemedText type="smallBold">
                {lastCorrectCount ?? 0}/{total}
              </ThemedText>
            </ThemedText>
          ) : (
            <ThemedText>
              Total questions: <ThemedText type="smallBold">{total}</ThemedText>
            </ThemedText>
          )}
          <ThemedText themeColor="textSecondary">
            {isCompleted
              ? `Completed on ${new Date(completedAt).toLocaleDateString()}. Retake it any time to try for a better score.`
              : 'Answer each question, then tap Next. You can go back to review a previous question ' +
                'before submitting.'}
          </ThemedText>
          <AnimatedPressable onPress={onStart} style={quizStyles.primaryButton}>
            <ThemedText type="smallBold" style={quizStyles.onAccent}>
              {isCompleted ? 'Retake Quiz' : 'Start Quiz'}
            </ThemedText>
          </AnimatedPressable>
        </ThemedView>
      </Animated.View>
    </QuizScreenFrame>
  );
}

function QuizActiveScreen({
  question,
  index,
  total,
  elapsedMs,
  selectedChoice,
  onSelect,
  onNext,
  onPrevious,
  canGoPrevious,
  isLast,
}: {
  question: QuizQuestionRow;
  index: number;
  total: number;
  elapsedMs: number;
  selectedChoice: number | undefined;
  onSelect: (choiceIndex: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  canGoPrevious: boolean;
  isLast: boolean;
}) {
  const theme = useTheme();
  const answered = selectedChoice !== undefined;
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

  return (
    <QuizScreenFrame>
      <Animated.View key={question.id} entering={FadeInDown.duration(220)}>
        <ThemedView type="backgroundElement" style={quizStyles.card}>
          <View style={quizStyles.rowBetween}>
            <ThemedText type="smallBold">
              Question {index + 1} of {total}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              ⏱ {formatClock(elapsedMs)}
            </ThemedText>
          </View>
          <View style={[quizStyles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
            <View
              style={[
                quizStyles.progressFill,
                { width: `${((index + 1) / total) * 100}%`, backgroundColor: Brand.accent },
              ]}
            />
          </View>

          <ThemedText style={quizStyles.prompt}>{question.prompt}</ThemedText>

          <View style={{ gap: Spacing.two }}>
            {question.choices.map((choice, choiceIndex) => {
              const isChosen = selectedChoice === choiceIndex;
              const isCorrect = choiceIndex === question.correctChoiceIndex;
              const showCorrect = answered && isCorrect;
              const showWrong = answered && isChosen && !isCorrect;
              return (
                <AnimatedPressable key={choiceIndex} disabled={answered} onPress={() => onSelect(choiceIndex)}>
                  <ThemedView
                    type="backgroundElement"
                    style={[
                      quizStyles.choice,
                      showCorrect && quizStyles.choiceCorrect,
                      showWrong && quizStyles.choiceWrong,
                    ]}>
                    <ThemedText type="smallBold" themeColor="textSecondary">
                      {letters[choiceIndex]}.
                    </ThemedText>
                    <ThemedText style={{ flexShrink: 1 }}>{choice}</ThemedText>
                  </ThemedView>
                </AnimatedPressable>
              );
            })}
          </View>

          {answered && (
            <ThemedText type="small" themeColor="textSecondary">
              {question.explanation}
            </ThemedText>
          )}

          <View style={quizStyles.navRow}>
            <AnimatedPressable
              disabled={!canGoPrevious}
              onPress={onPrevious}
              style={quizStyles.navButtonFlex}>
              <ThemedView
                type="backgroundElement"
                style={[quizStyles.navButton, !canGoPrevious && quizStyles.navButtonDisabled]}>
                <ThemedText type="smallBold">Previous</ThemedText>
              </ThemedView>
            </AnimatedPressable>
            <AnimatedPressable disabled={!answered} onPress={onNext} style={quizStyles.navButtonFlex}>
              <View
                style={[
                  quizStyles.navButton,
                  quizStyles.navButtonPrimary,
                  !answered && quizStyles.navButtonDisabled,
                ]}>
                <ThemedText type="smallBold" style={quizStyles.onAccent}>
                  {isLast ? 'Submit' : 'Next'}
                </ThemedText>
              </View>
            </AnimatedPressable>
          </View>
        </ThemedView>
      </Animated.View>
    </QuizScreenFrame>
  );
}

function QuizResultScreen({
  correctCount,
  total,
  totalTimeMs,
  avgTimeMs,
  onRetry,
}: {
  correctCount: number;
  total: number;
  totalTimeMs: number;
  avgTimeMs: number;
  onRetry: () => void;
}) {
  const percent = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const passed = percent >= 60;
  const wrongCount = total - correctCount;

  return (
    <QuizScreenFrame>
      <Animated.View entering={FadeIn.duration(220)}>
        <ThemedView type="backgroundElement" style={quizStyles.card}>
          <ThemedText themeColor="textSecondary">Quiz Result</ThemedText>
          <View style={quizStyles.rowCenter}>
            <View style={[quizStyles.scoreRing, { borderColor: Brand.accent }]}>
              <ThemedText type="subtitle">
                {correctCount}/{total}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                your score
              </ThemedText>
            </View>
            <View style={{ flex: 1, gap: Spacing.half }}>
              <ThemedText type="smallBold">
                {passed ? 'Congratulations!' : 'Keep practicing!'}
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                You {passed ? 'passed' : 'scored'} this quiz with{' '}
                <ThemedText type="smallBold" style={{ color: passed ? Brand.success : Brand.warning }}>
                  {percent}%
                </ThemedText>
              </ThemedText>
            </View>
          </View>

          <View style={quizStyles.statGrid}>
            <View style={[quizStyles.statChip, { backgroundColor: BadgeColors.green.bg }]}>
              <ThemedText type="smallBold" style={{ color: BadgeColors.green.fg }}>
                {correctCount}
              </ThemedText>
              <ThemedText type="small" style={{ color: BadgeColors.green.fg }}>
                Correct
              </ThemedText>
            </View>
            <View style={[quizStyles.statChip, { backgroundColor: BadgeColors.pink.bg }]}>
              <ThemedText type="smallBold" style={{ color: BadgeColors.pink.fg }}>
                {wrongCount}
              </ThemedText>
              <ThemedText type="small" style={{ color: BadgeColors.pink.fg }}>
                Wrong Answers
              </ThemedText>
            </View>
            <View style={[quizStyles.statChip, { backgroundColor: BadgeColors.blue.bg }]}>
              <ThemedText type="smallBold" style={{ color: BadgeColors.blue.fg }}>
                {formatClock(totalTimeMs)}
              </ThemedText>
              <ThemedText type="small" style={{ color: BadgeColors.blue.fg }}>
                Total Time
              </ThemedText>
            </View>
            <View style={[quizStyles.statChip, { backgroundColor: BadgeColors.amber.bg }]}>
              <ThemedText type="smallBold" style={{ color: BadgeColors.amber.fg }}>
                {formatClock(avgTimeMs)}
              </ThemedText>
              <ThemedText type="small" style={{ color: BadgeColors.amber.fg }}>
                Avg Time/Answer
              </ThemedText>
            </View>
          </View>

          <AnimatedPressable onPress={onRetry} style={quizStyles.primaryButton}>
            <ThemedText type="smallBold" style={quizStyles.onAccent}>
              Try Quiz Again
            </ThemedText>
          </AnimatedPressable>
        </ThemedView>
      </Animated.View>
    </QuizScreenFrame>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.four,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  tabItem: {
    paddingBottom: Spacing.two,
  },
  tabLabel: {
    textTransform: 'uppercase',
  },
  content: {
    padding: Spacing.four,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  progressHeader: {
    gap: Spacing.two,
  },
  cardCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressTrack: {
    height: 6,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  stackArea: {
    position: 'relative',
  },
  decoyCard: {
    position: 'absolute',
    height: 16,
    borderRadius: Radius.card,
  },
  decoyCardFar: {
    left: 28,
    right: 28,
    opacity: 0.3,
  },
  decoyCardNear: {
    left: 14,
    right: 14,
    opacity: 0.55,
  },
  flashcard: {
    borderRadius: Radius.card,
    overflow: 'hidden',
    shadowColor: Brand.accent,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 6,
  },
  flashcardHeader: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  flashcardKickerChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
    backgroundColor: '#FFFFFF33',
  },
  onAccentBold: {
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  flashcardScroll: {
    flex: 1,
    alignSelf: 'stretch',
  },
  flashcardScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.four,
  },
  flashcardMain: {
    textAlign: 'center',
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '600',
  },
  flashcardHintPill: {
    position: 'absolute',
    bottom: Spacing.three,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
    backgroundColor: '#80808022',
  },
  gradeRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  gradeButtonFlex: {
    flex: 1,
  },
  gradeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
    paddingVertical: Spacing.three,
    borderRadius: Radius.card,
  },
  gradeButtonIcon: {
    fontSize: 22,
    fontWeight: '700',
  },
  notesToolbar: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  toolbarButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.four,
  },
  doneState: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  doneEmoji: {
    fontSize: 40,
    lineHeight: 48,
  },
  doneRestartButton: {
    backgroundColor: Brand.accent,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
    marginTop: Spacing.two,
  },
});

const quizStyles = StyleSheet.create({
  frame: {
    justifyContent: 'center',
  },
  card: {
    borderRadius: Radius.card,
    padding: Spacing.five,
    gap: Spacing.three,
  },
  onAccent: {
    color: '#FFFFFF',
  },
  prompt: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '700',
  },
  startBanner: {
    backgroundColor: Brand.accent,
    borderRadius: Spacing.three,
    padding: Spacing.four,
  },
  primaryButton: {
    backgroundColor: Brand.accent,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.four,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  progressTrack: {
    height: 6,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  choice: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  choiceCorrect: {
    backgroundColor: Brand.success + '33',
    borderWidth: 1,
    borderColor: Brand.success,
  },
  choiceWrong: {
    backgroundColor: Brand.danger + '33',
    borderWidth: 1,
    borderColor: Brand.danger,
  },
  navRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  navButtonFlex: {
    flex: 1,
  },
  navButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  navButtonPrimary: {
    backgroundColor: Brand.accent,
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  scoreRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  statChip: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
  },
});
