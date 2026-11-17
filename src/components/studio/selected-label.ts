/** A closed select's hover text: the selected option's whole label, since its box can cut it. */
export const selectedLabel = (options: readonly { value: string; label: string }[], value: string): string | undefined => options.find((o) => o.value === value)?.label;
