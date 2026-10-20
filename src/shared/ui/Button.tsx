import { type JSX, splitProps } from "solid-js";
import { cn } from "@/shared/lib/cn";
import { Spinner } from "./display";

export type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "subtle" | "danger";
  size?: "md" | "sm" | "icon";
  loading?: boolean;
};

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, [
    "variant",
    "size",
    "loading",
    "class",
    "children",
    "type",
    "disabled",
  ]);
  return (
    <button
      type={local.type ?? "button"}
      disabled={local.disabled || local.loading}
      aria-busy={local.loading || undefined}
      class={cn(
        "btn",
        local.variant === "primary" && "btn-primary",
        local.variant === "subtle" && "btn-subtle",
        local.variant === "danger" && "btn-danger",
        local.size === "sm" && "btn-sm",
        local.size === "icon" && "btn-icon",
        local.class,
      )}
      {...rest}
    >
      {local.loading && <Spinner size={14} />}
      {local.children}
    </button>
  );
}
