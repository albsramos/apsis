import type { Spec } from '@/api';
import { cutList } from '@/lib/drawing';
import { area, mm } from '@/lib/format';
import styles from './CutList.module.css';

/** What to buy and cut: boards grouped by material, then hardware. */
export function CutList({ spec }: { spec: Spec }) {
  const lists = cutList(spec);
  return (
    <div className={styles.cut}>
      {lists.map((m) => (
        <section key={m.material} className={styles.section}>
          <div className={styles.head}>
            <h3 className={styles.heading}>{m.material}</h3>
            <span className={styles.area}>{area(m.area)} before waste</span>
          </div>
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Part</th>
                  <th scope="col">Name</th>
                  <th scope="col" className={styles.num}>
                    Qty
                  </th>
                  <th scope="col" className={styles.num}>
                    Length
                  </th>
                  <th scope="col" className={styles.num}>
                    Width
                  </th>
                  <th scope="col" className={styles.num}>
                    Thick
                  </th>
                </tr>
              </thead>
              <tbody>
                {m.groups.map((g) => (
                  <tr key={g.letter}>
                    <td className={styles.mono}>{g.letter}</td>
                    <td>{g.name}</td>
                    <td className={styles.num}>{g.quantity}</td>
                    <td className={styles.num}>{mm(g.length)}</td>
                    <td className={styles.num}>{mm(g.width)}</td>
                    <td className={styles.num}>{mm(g.thickness)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {spec.hardware.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.heading}>Hardware</h3>
          <table className={styles.table}>
            <tbody>
              {spec.hardware.map((h) => (
                <tr key={h.id}>
                  <td>{h.name}</td>
                  <td className={styles.num}>{h.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <p className={styles.note}>Lengths run along the grain. Add 10–15% for waste and saw kerf when buying sheets.</p>
    </div>
  );
}
