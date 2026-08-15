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
      className={`flex h-6 shrink-0 items-center justify-center whitespace-nowrap px-2 text-xs leading-none ${className}`}
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
