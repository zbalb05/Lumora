import type { DocumentSourceType } from '@/db/queries/documents';

const ICONS: Record<DocumentSourceType, string> = {
  pdf: '📄',
  image: '🖼️',
  text: '📝',
};

export function sourceTypeIcon(sourceType: DocumentSourceType): string {
  return ICONS[sourceType] ?? '📄';
}
