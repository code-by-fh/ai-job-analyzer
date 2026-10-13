import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

/** Native select with the prototype's chevron; wrap it in <Field> for label, hint and error. */
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="select">
      <select className={cx("input", className)} {...rest}>
        {children}
      </select>
      <Icon icon={ChevronDown} />
    </span>
  );
}
