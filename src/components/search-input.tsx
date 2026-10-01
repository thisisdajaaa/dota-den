"use client";

import { useRef, useState, type ComponentProps, type Ref } from "react";
import { Search, X } from "lucide-react";
import { cn } from "cn";

/**
 * A search box with a clear (×) button that shows once there's text. Escape also clears.
 * Controlled (`value` + `onValueChange`) or uncontrolled (`defaultValue`, e.g. in a form).
 */
export function SearchInput({
  value,
  defaultValue,
  onValueChange,
  onKeyDown,
  className,
  inputClassName,
  clearLabel = "Clear search",
  ref,
  ...props
}: Omit<ComponentProps<"input">, "type" | "value" | "defaultValue" | "ref"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Classes for the wrapper; `inputClassName` styles the input itself. */
  inputClassName?: string;
  clearLabel?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  const inner = useRef<HTMLInputElement | null>(null);
  const controlled = value !== undefined;
  const [hasText, setHasText] = useState(Boolean(defaultValue));
  const showClear = controlled ? value !== "" : hasText;

  const setRefs = (el: HTMLInputElement | null) => {
    inner.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  const clear = () => {
    if (controlled) onValueChange?.("");
    else if (inner.current) {
      inner.current.value = "";
      setHasText(false);
      onValueChange?.("");
    }
    inner.current?.focus();
  };

  return (
    <div className={cn("relative", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        {...props}
        ref={setRefs}
        type="search"
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => {
          if (!controlled) setHasText(e.target.value !== "");
          onValueChange?.(e.target.value);
          props.onChange?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && showClear) {
            e.preventDefault();
            clear();
          }
          onKeyDown?.(e);
        }}
        className={cn(
          "h-9 w-full rounded-lg border border-white/[0.08] bg-background/60 pr-9 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40",
          // One clear button: hide the browser's own.
          "[&::-webkit-search-cancel-button]:appearance-none",
          inputClassName,
        )}
      />
      {showClear && (
        <button
          type="button"
          onClick={clear}
          aria-label={clearLabel}
          className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      )}
    </div>
  );
}
