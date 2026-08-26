import { useEffect, useState } from "react";

function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

interface TimeAgoProps {
  date: Date | string;
  className?: string;
}

export function TimeAgo({ date, className = "" }: TimeAgoProps) {
  const parsed = typeof date === "string" ? new Date(date) : date;
  const [label, setLabel] = useState(() => formatTimeAgo(parsed));

  useEffect(() => {
    const tick = () => setLabel(formatTimeAgo(parsed));
    const interval = setInterval(tick, 30_000);
    tick();
    return () => clearInterval(interval);
  }, [parsed.getTime()]);

  return (
    <time
      dateTime={parsed.toISOString()}
      title={parsed.toLocaleString()}
      className={className}
    >
      {label}
    </time>
  );
}
