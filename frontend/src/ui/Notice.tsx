import { CircleAlert, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

export type NoticeTone = "info" | "warn" | "error";

const NOTICE_ICON: Record<NoticeTone, LucideIcon> = {
  info: Info,
  warn: TriangleAlert,
  error: CircleAlert,
};
const NOTICE_CLASS: Record<NoticeTone, string | null> = {
  info: null,
  warn: "notice-warn",
  error: "notice-error",
};

interface NoticeProps {
  tone?: NoticeTone;
  /**
   * False when the notice sits inside a live region that is always mounted and announces it, or
   * when another alert already announces the same failure (one alert per outage).
   */
  announce?: boolean;
  children: ReactNode;
}

/** Inline banner; errors use crimson with an icon and words (spec 5). */
export function Notice({ tone = "info", announce = true, children }: NoticeProps) {
  const role = announce && tone === "error" ? "alert" : undefined;
  return (
    <div className={cx("notice", NOTICE_CLASS[tone])} role={role}>
      <Icon icon={NOTICE_ICON[tone]} />
      <div>{children}</div>
    </div>
  );
}
