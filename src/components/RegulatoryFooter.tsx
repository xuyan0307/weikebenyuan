const ICP_RECORD = '闽ICP备2025084332号-2';

interface RegulatoryFooterProps {
  className?: string;
  color?: string;
}

export default function RegulatoryFooter({
  className = '',
  color = 'var(--muted-foreground)',
}: RegulatoryFooterProps) {
  return (
    <footer
      data-cmp="RegulatoryFooter"
      className={`flex items-center justify-center px-4 py-2 text-xs ${className}`}
      style={{ color }}
    >
      <a
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noreferrer noopener"
        className="transition-opacity hover:opacity-75"
      >
        {ICP_RECORD}
      </a>
    </footer>
  );
}
