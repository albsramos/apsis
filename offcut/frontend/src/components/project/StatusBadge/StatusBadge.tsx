import { AlertCircle, Camera, Check, Loader, PenLine } from 'lucide-react';
import type { ProjectStatus } from '@/api';
import { Badge } from '@/components/ui';

const ICON = 12;

export function StatusBadge({ status, pendingCount = 0 }: { status: ProjectStatus; pendingCount?: number }) {
  switch (status) {
    case 'ready':
      return (
        <Badge tone="success" icon={<Check size={ICON} aria-hidden="true" />}>
          Plans ready
        </Badge>
      );
    case 'analyzing':
      return (
        <Badge tone="accent" icon={<Loader size={ICON} aria-hidden="true" />}>
          Drawing up
        </Badge>
      );
    case 'needs_input':
      return (
        <Badge tone="highlight" icon={<Camera size={ICON} aria-hidden="true" />}>
          {pendingCount > 0 ? `Needs ${pendingCount} more` : 'Needs your input'}
        </Badge>
      );
    case 'failed':
      return (
        <Badge tone="danger" icon={<AlertCircle size={ICON} aria-hidden="true" />}>
          Failed
        </Badge>
      );
    default:
      return (
        <Badge icon={<PenLine size={ICON} aria-hidden="true" />}>
          Draft
        </Badge>
      );
  }
}
