import { LoaderCircle, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

export type ButtonVariant = "default" | "primary" | "ghost" | "danger";

const VARIANT_CLASS: Record<ButtonVariant, string | null> = {
  default: null,
  primary: "btn-primary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  icon?: LucideIcon;
  /** Icon-only buttons need an aria-label. */
  iconOnly?: boolean;
  /**
   * Shows a spinner and blocks activation. The button stays focusable (aria-disabled, not
   * disabled), so keyboard focus is not lost while a request runs.
   */
  busy?: boolean;
  /**
   * Looks disabled and blocks activation, but stays focusable (aria-disabled), so a button that
   * becomes unavailable while focused does not drop focus to the page.
   */
  inactive?: boolean;
}

type ButtonLook = Pick<ButtonProps, "variant" | "size" | "iconOnly" | "className">;

export function Button(props: ButtonProps) {
  const { look, icon, busy, blocked, dom } = splitButtonProps(props);
  // type="button" first so an explicit type in props wins; buttons never submit by accident.
  return (
    <button
      type="button"
      {...dom}
      className={buttonClasses(look)}
      aria-busy={busy || dom["aria-busy"] || undefined}
      aria-disabled={blocked || dom["aria-disabled"]}
      onClick={blocked ? blockActivation : dom.onClick}
    >
      {busy ? <Icon icon={LoaderCircle} className="spin" /> : icon && <Icon icon={icon} />}
      {look.iconOnly ? null : <span>{dom.children}</span>}
    </button>
  );
}

/** preventDefault also stops a busy or inactive submit button from submitting its form. */
function blockActivation(event: MouseEvent<HTMLButtonElement>): void {
  event.preventDefault();
}

function splitButtonProps(props: ButtonProps) {
  const { variant, size, icon, iconOnly, busy = false, inactive = false, ...dom } = props;
  return {
    look: { variant, size, iconOnly, className: dom.className },
    icon,
    busy,
    blocked: busy || inactive,
    dom,
  };
}

function buttonClasses({
  variant = "default",
  size = "md",
  iconOnly = false,
  className,
}: ButtonLook): string {
  return cx(
    "btn",
    VARIANT_CLASS[variant],
    size === "sm" && "btn-sm",
    iconOnly && "btn-icon",
    className,
  );
}
