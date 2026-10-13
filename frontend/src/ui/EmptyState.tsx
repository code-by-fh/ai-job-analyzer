import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function EmptyState({ icon, title, children, actions }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty-ico" aria-hidden="true">
        <Icon icon={icon} />
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}
