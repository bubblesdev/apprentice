import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import { cx } from "../lib/cx";
import styles from "./Button.module.css";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "primary" | "light" | "secondary" | "amber" | "coral";

interface Common {
  variant?: ButtonVariant;
  block?: boolean;
  compact?: boolean;
  icon?: IconName;
  children: ReactNode;
}

function classes(variant: ButtonVariant, block?: boolean, compact?: boolean): string {
  return cx(styles.button, styles[variant], block && styles.block, compact && styles.compact);
}

export function Button({
  variant = "primary",
  block,
  compact,
  icon,
  children,
  type = "button",
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={classes(variant, block, compact)} {...rest}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  block,
  compact,
  icon,
  children,
  ...rest
}: Common & LinkProps) {
  return (
    <Link className={classes(variant, block, compact)} {...rest}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </Link>
  );
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: IconName;
  label: string;
  glass?: boolean;
}

/** 44 px round icon button; `label` becomes its accessible name. */
export function IconButton({ icon, label, glass, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cx(styles.button, styles.icon, glass && styles.glass)}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}

export function IconLink({
  icon,
  label,
  glass,
  ...rest
}: Omit<LinkProps, "children"> & { icon: IconName; label: string; glass?: boolean }) {
  return (
    <Link
      aria-label={label}
      className={cx(styles.button, styles.icon, glass && styles.glass)}
      {...rest}
    >
      <Icon name={icon} />
    </Link>
  );
}
