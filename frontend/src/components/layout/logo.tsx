import { Link } from 'react-router';

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <img src="/favicon.svg" alt="" className="size-8 rounded-[10px] shadow-sm" />
      <span className="text-[18px]">SyncSpace</span>
    </Link>
  );
}
