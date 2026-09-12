/** The few glyphs the wireframes use, inline so nothing has to be fetched. */
const PATHS: Record<string, string> = {
  plus: "M12 5v14M5 12h14",
  check: "M20 6L9 17l-5-5",
  chevron: "M6 9l6 6 6-6",
  back: "M15 18l-6-6 6-6",
  pin: "M12 21s7-6.4 7-11a7 7 0 10-14 0c0 4.6 7 11 7 11z",
  clock: "M12 7v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z",
};

export function Icon({
  name, size = 16, color = "currentColor", width = 2.2,
}: { name: keyof typeof PATHS | string; size?: number; color?: string; width?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}
