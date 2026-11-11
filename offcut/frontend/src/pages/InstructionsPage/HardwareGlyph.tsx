import styles from './InstructionsPage.module.css';

/** A small line drawing of a piece of hardware, guessed from its name. */
export function HardwareGlyph({ name }: { name: string }) {
  const n = name.toLowerCase();
  let shape;
  if (n.includes('dowel')) {
    shape = (
      <>
        <rect x="10" y="3" width="8" height="22" rx="3" className={styles.glyphSoft} />
        <path d="M12.5 7v14M15.5 7v14" />
      </>
    );
  } else if (n.includes('screw')) {
    shape = (
      <>
        <path d="M8 4h12M10 4l1 4h6l1-4" />
        <path d="M14 8v16M11 11l6 2M11 15l6 2M11 19l6 2" />
      </>
    );
  } else if (n.includes('nail') || n.includes('brad')) {
    shape = <path d="M10 4h8M14 4v20" />;
  } else if (n.includes('runner') || n.includes('slide')) {
    shape = (
      <>
        <rect x="3" y="10" width="22" height="8" rx="1" />
        <path d="M6 14h16" />
      </>
    );
  } else if (n.includes('knob') || n.includes('handle')) {
    shape = (
      <>
        <circle cx="14" cy="11" r="6" />
        <path d="M14 17v7" />
      </>
    );
  } else if (n.includes('glue')) {
    shape = <path d="M10 4h8l2 6H8zM12 10v14h4V10" />;
  } else {
    shape = <rect x="6" y="6" width="16" height="16" rx="2" />;
  }
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" className={styles.glyph} aria-hidden="true">
      {shape}
    </svg>
  );
}
