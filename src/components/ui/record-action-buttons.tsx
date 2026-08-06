import { EyeIcon, PencilIcon } from 'lucide-react';

interface RecordActionButtonsProps {
  onView: () => void;
  onEdit?: () => void;
  viewLabel?: string;
  editLabel?: string;
  className?: string;
}

export function RecordActionButtons({
  onView,
  onEdit,
  viewLabel = '查看',
  editLabel = '编辑',
  className = '',
}: RecordActionButtonsProps) {
  return (
    <div className={`flex items-center justify-center gap-1 ${className}`}>
      <button
        type="button"
        className="flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-xs font-medium transition-opacity hover:opacity-80"
        style={{ background: 'rgba(30,136,229,0.1)', color: 'var(--brand)' }}
        onClick={onView}
        title="查看详情"
      >
        <EyeIcon size={11} />
        {viewLabel}
      </button>
      {onEdit && (
        <button
          type="button"
          className="flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-xs font-medium transition-opacity hover:opacity-80"
          style={{ background: 'rgba(100,100,100,0.1)', color: 'var(--foreground)' }}
          onClick={onEdit}
          title="编辑"
        >
          <PencilIcon size={11} />
          {editLabel}
        </button>
      )}
    </div>
  );
}
