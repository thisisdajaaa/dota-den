"use client";

import * as React from "react";
import { cn } from "cn";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { DayPicker, getDefaultClassNames, type DayButton } from "react-day-picker";
import { useLocale, useT } from "@/common/i18n/client";
import { LOCALE_TAGS } from "@/common/i18n/locales";
import { buttonVariants } from "@/components/ui/button";

/**
 * Month grid on react-day-picker, themed with the app tokens. Month and day names come from
 * the viewer's language through Intl (date-fns has no Filipino or Cebuano locale).
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  formatters,
  labels,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames();
  const locale = useLocale();
  const t = useT();
  const tag = LOCALE_TAGS[locale];

  const intl = React.useMemo(() => {
    const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag, o);
    return {
      caption: f({ month: "long", year: "numeric" }),
      month: f({ month: "long" }),
      year: f({ year: "numeric" }),
      weekday: f({ weekday: "short" }),
      weekdayLong: f({ weekday: "long" }),
      full: f({ dateStyle: "full" }),
    };
  }, [tag]);

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      className={cn(
        "group/calendar bg-transparent p-0 [--cell-size:--spacing(10)] sm:[--cell-size:--spacing(9)]",
        className,
      )}
      formatters={{
        formatCaption: (d) => intl.caption.format(d),
        formatMonthDropdown: (d) => intl.month.format(d),
        formatYearDropdown: (d) => intl.year.format(d),
        formatWeekdayName: (d) => intl.weekday.format(d),
        ...formatters,
      }}
      labels={{
        labelDayButton: (d, m) =>
          [m.today ? t("common.datePicker.today") : null, intl.full.format(d)]
            .filter(Boolean)
            .join(", ") + (m.selected ? `, ${t("common.datePicker.selected")}` : ""),
        labelWeekday: (d) => intl.weekdayLong.format(d),
        labelGrid: (d) => intl.caption.format(d),
        labelNext: () => t("common.datePicker.nextMonth"),
        labelPrevious: () => t("common.datePicker.previousMonth"),
        labelMonthDropdown: () => t("common.datePicker.month"),
        labelYearDropdown: () => t("common.datePicker.year"),
        labelNav: () => t("common.datePicker.navigation"),
        ...labels,
      }}
      classNames={{
        root: cn("w-fit", defaults.root),
        months: cn("relative flex flex-col gap-4 md:flex-row", defaults.months),
        month: cn("flex w-full flex-col gap-3", defaults.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaults.nav,
        ),
        button_previous: cn(
          buttonVariants({ variant: "ghost" }),
          "size-(--cell-size) p-0 select-none aria-disabled:opacity-40",
          defaults.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost" }),
          "size-(--cell-size) p-0 select-none aria-disabled:opacity-40",
          defaults.button_next,
        ),
        month_caption: cn(
          "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
          defaults.month_caption,
        ),
        dropdowns: cn(
          "flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium",
          defaults.dropdowns,
        ),
        dropdown_root: cn(
          "relative rounded-md border border-input has-focus:border-ring has-focus:ring-3 has-focus:ring-ring/50 dark:bg-input/30",
          defaults.dropdown_root,
        ),
        dropdown: cn("absolute inset-0 bg-popover opacity-0 dark:scheme-dark", defaults.dropdown),
        caption_label: cn(
          "font-medium select-none",
          captionLayout === "label"
            ? "text-sm"
            : "flex h-8 items-center gap-1 rounded-md pr-1.5 pl-2 text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground",
          defaults.caption_label,
        ),
        month_grid: "w-full border-collapse",
        weekdays: cn("flex", defaults.weekdays),
        weekday: cn(
          "flex-1 rounded-md text-[0.75rem] font-normal text-muted-foreground select-none",
          defaults.weekday,
        ),
        week: cn("mt-1 flex w-full", defaults.week),
        day: cn(
          "group/day relative aspect-square h-full w-full p-0 text-center select-none",
          defaults.day,
        ),
        today: cn("text-primary", defaults.today),
        outside: cn("text-muted-foreground/60", defaults.outside),
        disabled: cn("text-muted-foreground opacity-40", defaults.disabled),
        hidden: cn("invisible", defaults.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...rootProps }) => (
          <div data-slot="calendar" ref={rootRef} className={cn(className)} {...rootProps} />
        ),
        Chevron: ({ className, orientation, ...chevronProps }) => {
          const Icon =
            orientation === "left"
              ? ChevronLeftIcon
              : orientation === "right"
                ? ChevronRightIcon
                : ChevronDownIcon;
          return <Icon className={cn("size-4", className)} {...chevronProps} />;
        },
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <button
      ref={ref}
      type="button"
      data-day={day.date.toDateString()}
      data-selected={modifiers.selected || undefined}
      data-today={modifiers.today || undefined}
      className={cn(
        "inline-flex size-(--cell-size) items-center justify-center rounded-md text-sm tabular-nums transition-colors outline-none",
        "hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        "data-today:font-semibold data-today:ring-1 data-today:ring-primary/40",
        "data-selected:bg-primary data-selected:font-semibold data-selected:text-primary-foreground data-selected:hover:bg-primary/85",
        "disabled:pointer-events-none",
        className,
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
