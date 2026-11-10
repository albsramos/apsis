import type { Issue, Layout } from '@/api'
import { StatusDot } from '@/components/ui/StatusDot'
import { ago } from '@/lib/format'
import { cx } from '@/lib/cx'
import styles from './IssueList.module.css'

/** What an issue is doing to the line, in words. Empty when it holds nothing up. */
export function impactText(issue: Issue, layout?: Layout): string {
  const parts: string[] = []
  const queued = issue.impact.queuedCarrierIds.length
  if (queued) parts.push(`${queued} ${queued === 1 ? 'carrier' : 'carriers'} queued behind`)
  const starved = layout?.nodes.find((n) => n.id === issue.impact.starvedNodeId)
  if (starved) parts.push(`${starved.name} has nothing on its way`)
  return parts.join(' · ')
}

/** Open issues as rows; choosing one selects its carrier. */
export function IssueList({ issues, layout, selectedId, onSelect }: { issues: Issue[]; layout?: Layout; selectedId?: string; onSelect: (carrierId: string) => void }) {
  if (!issues.length) return <p className={styles.empty}>Nothing needs attention.</p>
  return (
    <ul className={styles.list}>
      {issues.map((i) => {
        const impact = impactText(i, layout)
        return (
          <li key={i.id}>
            <button type="button" className={cx(styles.row, styles[i.severity], i.carrierId === selectedId && styles.selected)} onClick={() => onSelect(i.carrierId)}>
              <span className={styles.dot}>
                <StatusDot status={i.severity} />
              </span>
              <span className={styles.body}>
                <span className={styles.title}>{i.title}</span>
                <span className={styles.meta}>
                  <span className={styles.code}>{i.carrierId}</span> · {i.location}
                </span>
                {impact && <span className={styles.impact}>{impact}</span>}
              </span>
              <span className={styles.since}>{ago(i.since)}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
