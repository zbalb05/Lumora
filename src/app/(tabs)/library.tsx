import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Modal,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/animated-pressable';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, MaxContentWidth, Radius, Spacing, TabBarHeight } from '@/constants/theme';
import { deleteDocument, listAllDocuments } from '@/db/queries/documents';
import type { documents } from '@/db/schema';
import { useTheme } from '@/hooks/use-theme';
import { ingestFile, type PickedFile } from '@/services/ingestion';
import { pullRemoteChanges, pushPendingChanges } from '@/services/sync';
import { toDateKey } from '@/utils/calendar';
import { sourceTypeIcon } from '@/utils/document-icon';
import { pickDocument, pickPhoto } from '@/utils/pick-file';

type DocumentRow = typeof documents.$inferSelect;

const STATUS_LABEL: Record<DocumentRow['status'], string> = {
  pending: 'Waiting…',
  processing: 'Generating notes, flashcards & quiz…',
  ready: 'Ready',
  error: 'Failed — tap to see details',
};

/** Buckets a document's createdAt into a coarse recency group for section headers. */
function bucketFor(createdAt: string): 'Today' | 'This week' | 'Earlier' {
  const created = new Date(createdAt);
  if (toDateKey(created) === toDateKey(new Date())) return 'Today';
  const daysAgo = (Date.now() - created.getTime()) / 86_400_000;
  return daysAgo < 7 ? 'This week' : 'Earlier';
}

function groupByRecency(items: DocumentRow[]) {
  const order: ('Today' | 'This week' | 'Earlier')[] = ['Today', 'This week', 'Earlier'];
  return order
    .map((title) => ({ title, data: items.filter((item) => bucketFor(item.createdAt) === title) }))
    .filter((section) => section.data.length > 0);
}

export default function LibraryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { action } = useLocalSearchParams<{ action?: string }>();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [addMenuVisible, setAddMenuVisible] = useState(false);

  const refresh = useCallback(async () => {
    setDocuments(await listAllDocuments());
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await pushPendingChanges();
    await pullRemoteChanges();
    await refresh();
    setRefreshing(false);
  };

  const sections = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? documents.filter((doc) => doc.title.toLowerCase().includes(query))
      : documents;
    return groupByRecency(filtered);
  }, [documents, search]);

  const handleDelete = (item: DocumentRow) => {
    Alert.alert('Delete document?', `This removes "${item.title}" and all its notes, flashcards, and quiz.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteDocument(item.id);
          refresh();
        },
      },
    ]);
  };

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const runIngestion = async (file: PickedFile) => {
    setErrorMessage(null);
    setUploading(true);
    try {
      await ingestFile(file);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setUploading(false);
      refresh();
    }
  };

  const handleUpload = async () => {
    const file = await pickDocument();
    if (file) await runIngestion(file);
  };

  const handleCamera = async () => {
    const file = await pickPhoto();
    if (file) await runIngestion(file);
  };

  useEffect(() => {
    if (action === 'camera') {
      handleCamera();
      router.setParams({ action: undefined });
    }
  }, [action]);

  // Closes the add menu, then waits for its close animation to finish before running a
  // follow-up action that launches a native picker (camera/files) — firing it immediately
  // races the Modal's teardown on Android and the picker silently never appears.
  const closeMenuThen = (action: () => void) => {
    setAddMenuVisible(false);
    InteractionManager.runAfterInteractions(action);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <ThemedText type="subtitle">Library</ThemedText>
          <AnimatedPressable onPress={() => setAddMenuVisible(true)} disabled={uploading} hitSlop={12}>
            <View style={styles.addButton}>
              {uploading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <ThemedText type="subtitle" style={styles.addButtonLabel}>
                  +
                </ThemedText>
              )}
            </View>
          </AnimatedPressable>
        </ThemedView>

        <Modal
          visible={addMenuVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setAddMenuVisible(false)}>
          <Pressable style={styles.addMenuBackdrop} onPress={() => setAddMenuVisible(false)}>
            <Pressable style={styles.addMenuCard} onPress={() => {}}>
              <ThemedView type="backgroundElement" style={styles.addMenuCardInner}>
                <AnimatedPressable onPress={() => closeMenuThen(handleUpload)}>
                  <View style={styles.addMenuRow}>
                    <ThemedText style={styles.addMenuIcon}>📄</ThemedText>
                    <ThemedText type="smallBold">Upload file</ThemedText>
                  </View>
                </AnimatedPressable>
                <AnimatedPressable onPress={() => closeMenuThen(handleCamera)}>
                  <View style={styles.addMenuRow}>
                    <ThemedText style={styles.addMenuIcon}>📷</ThemedText>
                    <ThemedText type="smallBold">Take photo</ThemedText>
                  </View>
                </AnimatedPressable>
                <AnimatedPressable onPress={() => closeMenuThen(() => router.push('/record-lecture'))}>
                  <View style={styles.addMenuRow}>
                    <ThemedText style={styles.addMenuIcon}>🎙️</ThemedText>
                    <ThemedText type="smallBold">Record lecture</ThemedText>
                  </View>
                </AnimatedPressable>
              </ThemedView>
            </Pressable>
          </Pressable>
        </Modal>

        {errorMessage ? (
          <ThemedText themeColor="textSecondary" style={styles.error}>
            {errorMessage}
          </ThemedText>
        ) : null}

        <ThemedView type="backgroundElement" style={styles.searchBar}>
          <ThemedText style={styles.searchIcon}>🔍</ThemedText>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search your library…"
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </ThemedView>

        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Brand.accent} colors={[Brand.accent]} />
          }
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary">
              {search.trim()
                ? 'No documents match your search.'
                : 'Upload a PDF or image — or take a photo of your study material — ' +
                  'to start studying.'}
            </ThemedText>
          }
          renderSectionHeader={({ section }) => (
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionHeader}>
              {section.title}
            </ThemedText>
          )}
          renderItem={({ item, index }) => (
            <Animated.View
              entering={FadeInDown.duration(300).delay(index * 40)}
              layout={Layout.duration(200)}>
              <ThemedView type="backgroundElement" style={styles.docCard}>
                <Link href={{ pathname: '/document/[id]', params: { id: item.id } }} asChild>
                  <AnimatedPressable>
                    <View style={styles.docRow}>
                      <ThemedText style={styles.docIcon}>{sourceTypeIcon(item.sourceType)}</ThemedText>
                      <View style={styles.docTextColumn}>
                        <ThemedText numberOfLines={1} style={styles.docTitle}>
                          {item.title}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" style={styles.docStatus}>
                          {STATUS_LABEL[item.status]}
                        </ThemedText>
                      </View>
                    </View>
                  </AnimatedPressable>
                </Link>

                <View style={styles.docActions}>
                  {item.status === 'ready' &&
                    (['notes', 'flashcards', 'quiz'] as const).map((section) => (
                      <AnimatedPressable
                        key={section}
                        style={styles.docActionButton}
                        onPress={() =>
                          router.push({
                            pathname: '/document/[id]',
                            params: { id: item.id, tab: section },
                          })
                        }>
                        <ThemedView type="backgroundSelected" style={styles.docActionChip}>
                          <ThemedText type="small">
                            {section === 'notes' ? 'Notes' : section === 'flashcards' ? 'Flashcards' : 'Quiz'}
                          </ThemedText>
                        </ThemedView>
                      </AnimatedPressable>
                    ))}
                  <AnimatedPressable
                    style={styles.deleteButton}
                    onPress={() => handleDelete(item)}
                    hitSlop={8}>
                    <ThemedText type="small" style={styles.deleteLabel}>
                      Delete
                    </ThemedText>
                  </AnimatedPressable>
                </View>
              </ThemedView>
            </Animated.View>
          )}
        />
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingBottom: TabBarHeight + Spacing.two,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.three,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.accent,
  },
  addButtonLabel: {
    color: '#FFFFFF',
    lineHeight: 32,
  },
  addMenuBackdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  addMenuCard: {
    width: '100%',
    maxWidth: 320,
  },
  addMenuCardInner: {
    borderRadius: Radius.card,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  addMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  addMenuIcon: {
    fontSize: 20,
    lineHeight: 24,
  },
  error: {
    color: '#c0392b',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  searchIcon: {
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Spacing.one,
  },
  sectionHeader: {
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  list: {
    gap: Spacing.two,
  },
  docCard: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    gap: Spacing.two,
  },
  docIcon: {
    fontSize: 20,
    lineHeight: 24,
  },
  docTextColumn: {
    flex: 1,
    gap: Spacing.half,
  },
  docTitle: {
    fontWeight: '600',
    flexShrink: 1,
  },
  docStatus: {
    flexShrink: 0,
  },
  docActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  docActionButton: {
    minWidth: 0,
  },
  docActionChip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.four,
  },
  deleteButton: {
    marginLeft: 'auto',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  deleteLabel: {
    color: '#c0392b',
  },
});
