import { useGetCarrier, useGetLayout, useListIssues } from '@/api'
import { impactText } from '@/components/sheet/IssueList'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataList } from '@/components/ui/DataList'
import { Icon } from '@/components/ui/Icon'
import { Progress } from '@/components/ui/Progress'
import { Section } from '@/components/ui/Section'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusDot } from '@/components/ui/StatusDot'
import { ago, clock, duration, PAYLOAD_LABEL, SEVERITY_LABEL, SEVERITY_TONE, times } from '@/lib/format'
import { LIVE, STATIC } from '@/lib/live'
import { useSelection } from '@/lib/selection'
import styles from './CarrierSheet.module.css'

/** The sheet for one carrier: where it is, what is wrong with it, what it carries, where it has been. */
export function CarrierSheet() {
  const { factoryId, carrierId = '', select } = useSelection()
  const carrier = useGetCarrier(factoryId, carrierId, { query: LIVE })
  const layout = useGetLayout(factoryId, { query: STATIC }).data
  const issue = useListIssues(factoryId, { query: LIVE }).data?.find((i) => i.carrierId === carrierId && i.severity === 'fault')

  const back = (
    <Button variant="secondary" size="icon" onClick={() => select(null)} aria-label="Back to the factory">
      <Icon name="back" />
    </Button>
  )

  if (carrier.isError) {
    return (
      <div className={styles.header}>
        {back}
        <div className={styles.heading}>
          <h1 className={styles.id}>{carrierId}</h1>
          <p className={styles.sub}>This carrier is not on the line.</p>
        </div>
      </div>
    )
  }
  const c = carrier.data
  if (!c) {
    return (
      <div className={styles.header}>
        {back}
        <div className={styles.heading}>
          <h1 className={styles.id}>{carrierId}</h1>
          <Skeleton width={140} />
        </div>
      </div>
    )
  }

  const ratio = c.dwellSec / c.expectedSec
  const late = ratio >= 1.8
  const impact = issue && impactText(issue, layout)

  return (
    <>
      <div className={styles.header}>
        {back}
        <div className={styles.heading}>
          <h1 className={styles.id}>{c.id}</h1>
          <p className={styles.sub}>{c.model}</p>
        </div>
        <Badge tone={SEVERITY_TONE[c.status]}>{SEVERITY_LABEL[c.status]}</Badge>
      </div>

      <Section title="Where">
        <p className={styles.where}>
          {c.fromNodeName} <span className={styles.arrow}>→</span> {c.toNodeName}
        </p>
        <Progress value={c.position.offset * 100} label="Progress along this stretch" />
        <div className={styles.dwell}>
          <span>
            <span className={styles.num}>{duration(c.dwellSec)}</span> here, normally <span className={styles.num}>{duration(c.expectedSec)}</span>
          </span>
          {late && <Badge tone={ratio >= 4 ? 'danger' : 'warn'}>{times(ratio)} normal</Badge>}
        </div>
        {impact && <p className={styles.impact}>{impact}</p>}
      </Section>

      <Section title="Carrier" aside={c.faults.length ? `${c.faults.length} open` : undefined}>
        {c.faults.length === 0 ? (
          <p className={styles.quiet}>No faults.</p>
        ) : (
          <ul className={styles.list}>
            {c.faults.map((f) => (
              <li key={f.id} className={styles.entry}>
                <span className={styles.dot}>
                  <StatusDot status={f.severity} />
                </span>
                <div className={styles.entryBody}>
                  <span className={styles.entryTitle}>{f.title}</span>
                  {f.detail && <span className={styles.entryDetail}>{f.detail}</span>}
                  <span className={styles.entryMeta}>
                    {f.code} · since {clock(f.since)} ({ago(f.since)})
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <DataList
          items={[
            { label: 'Battery', value: `${c.batteryPct}%`, mono: true },
            { label: 'Cycles since service', value: c.cyclesSinceService.toLocaleString('en-US'), mono: true },
          ]}
        />
      </Section>

      <Section title="Payload" aside={c.payload && <Badge tone={c.payload.status === 'ok' ? 'neutral' : 'warn'}>{c.payload.status === 'ok' ? 'No defects' : 'On hold'}</Badge>}>
        {!c.payload ? (
          <p className={styles.quiet}>Empty. This carrier has no payload.</p>
        ) : (
          <>
            <div>
              <p className={styles.payloadName}>{c.payload.name}</p>
              <p className={styles.sub}>
                {PAYLOAD_LABEL[c.payload.type]}
                {c.payload.variant && ` · ${c.payload.variant}`}
              </p>
            </div>
            {c.payload.defects.length > 0 && (
              <ul className={styles.list}>
                {c.payload.defects.map((d) => (
                  <li key={d.id} className={styles.entry}>
                    <span className={styles.dot}>
                      <StatusDot status={d.severity} />
                    </span>
                    <div className={styles.entryBody}>
                      <span className={styles.entryTitle}>{d.title}</span>
                      <span className={styles.entryMeta}>
                        found at {d.foundAt} · {clock(d.at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <DataList
              items={[
                { label: 'Serial', value: c.payload.id, mono: true },
                ...(c.payload.orderId ? [{ label: 'Order', value: c.payload.orderId, mono: true }] : []),
                ...(c.payload.nextOperation ? [{ label: 'Next operation', value: c.payload.nextOperation }] : []),
              ]}
            />
          </>
        )}
      </Section>

      <Section title="Trail" aside="newest first">
        {c.trail.length === 0 ? (
          <p className={styles.quiet}>No stations passed yet on this run.</p>
        ) : (
          <ol className={styles.trail}>
            {c.trail.map((t) => (
              <li key={`${t.nodeId}-${t.at}`} className={styles.step}>
                <span className={styles.dot}>
                  <StatusDot status={t.result} size={7} />
                </span>
                <span className={styles.stepName}>{t.nodeName}</span>
                <span className={styles.stepTime}>
                  {clock(t.at)} · {duration(t.durationSec)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  )
}
