export interface SegOption<T extends string> {
  value: T;
  label: string;
}

export interface SegProps<T extends string> {
  options: readonly SegOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

/** Segmented control: one choice of a few, shown side by side. */
export function Seg<T extends string>({ options, value, onChange, label }: SegProps<T>) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
