# Lumora

An AI-powered study app: upload documents and audio, chat with an AI tutor about them, and generate flashcards and quizzes for spaced-repetition review.

Built with [Expo](https://expo.dev) + React Native, targeting iOS, Android, and web from one codebase.

## Get started

```bash
npm install
npx expo start
```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo
- a web browser, via `npx expo start --web`

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_GEMINI_API_KEY` to a Gemini API key before
uploading anything — the ingestion pipeline calls Gemini directly from the app. This is fine for
local development, but note the key ships inside the JS bundle: it must move behind a backend
proxy before any real release.

## Project structure

This project uses [Expo Router](https://docs.expo.dev/router/introduction) file-based routing, rooted at `src/app`.

- `src/app/(tabs)` — the 4 tab screens: Home, Library, Chat, Progress
- `src/app/document/[id].tsx` — per-document workspace (Notes, Flashcards, Quiz), pushed from Library
- `src/app/settings.tsx` — pushed from Home's header
- `src/components` — shared UI components, including the cross-platform tab bar
- `src/constants` — theme (colors, spacing, fonts)
- `src/hooks` — shared hooks (e.g. color scheme, theme)
- `src/db` — Drizzle schema (`schema.ts`), SQLite client + migration runner (`client.ts`), and
  per-table query helpers (`queries/`). All data is local-only for now (see `drizzle.config.ts`
  and `drizzle/` for generated migrations — regenerate with `npx drizzle-kit generate` after
  editing `schema.ts`).
- `src/services/gemini.ts` — Gemini calls: document/audio extraction, MapReduce summarization,
  flashcard/quiz generation, and the AI Tutor chat (`chat()`, grounded in a study set's notes)
- `src/services/ingestion.ts` — orchestrates the pipeline end-to-end, persists results, and
  aligns live-recording slide markers to transcript chunks
- `src/utils/bionic.ts`, `src/components/bionic-text.tsx` — bionic reading text transform
- `src/utils/calendar.ts` — month-grid and streak helpers for the Progress screen

## Notes on a couple of non-obvious choices

- The Gemini model is pinned to `gemini-flash-latest` (Google's rolling alias), not a dated
  version — dated model names get sunset for new API keys without warning.
- `expo-file-system`'s `File.pickFileAsync()` is used for file picking; `expo-document-picker`
  is not a dependency — SDK 57 folded picking into `expo-file-system`.
- `metro.config.js` adds `wasm` to `resolver.assetExts` — required for `expo-sqlite`'s web build
  (WASM SQLite) to bundle at all.

## Learn more

- [Expo documentation](https://docs.expo.dev/)
- [Expo Router documentation](https://docs.expo.dev/router/introduction/)
