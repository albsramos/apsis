import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, ListTree, PanelRight, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  useUpdateSpec,
  useValidateSpec,
  type Issue,
  type Spec,
  type SpecVersion,
} from '@/api';
import { IsoDrawing, OrthoDrawing } from '@/components/drawing';
import { Badge, Button, Callout, Dialog, SegmentedControl, Tabs } from '@/components/ui';
import { explodedItems, labelParts, pieceBox } from '@/lib/drawing';
import { mm, plural } from '@/lib/format';
import { useIsNarrow } from '@/lib/hooks';
import { CutList } from './CutList';
import { Inspector } from './Inspector';
import { IssueList } from './IssueList';
import { PartSheets } from './PartSheets';
import { PartsList } from './PartsList';
import styles from './Workspace.module.css';

export interface WorkspaceProps {
  projectId: string;
  name: string;
  version: SpecVersion;
}

/**
 * The drawings, parts and cut list for one spec version. Edits make a local
 * draft that is re-checked by the validator as you type, without calling the
 * AI, and saved as a new version.
 */
export function Workspace({ projectId, name, version }: WorkspaceProps) {
  const [draft, setDraft] = useState<Spec>(version.spec);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<'parts' | 'inspector' | null>(null);
  const narrow = useIsNarrow();
  const qc = useQueryClient();

  const validate = useValidateSpec();
  const save = useUpdateSpec({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        void qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      },
    },
  });

  // Re-check the draft a moment after each edit.
  const { mutate: runValidate } = validate;
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => runValidate({ data: { spec: draft } }), 250);
    return () => clearTimeout(t);
  }, [draft, dirty, runValidate]);

  const issues: Issue[] = dirty ? (validate.data?.issues ?? version.issues) : version.issues;
  const fixings = dirty ? (validate.data?.fixings ?? version.fixings) : version.fixings;
  const errors = issues.filter((i) => i.severity === 'error');
  const flagged = useMemo(() => new Set(errors.flatMap((i) => i.parts ?? [])), [errors]);
  const labels = useMemo(() => labelParts(draft), [draft]);
  const letters = useMemo(() => new Map([...labels.byPart].map(([id, g]) => [id, g.letter])), [labels]);
  const names = useMemo(() => new Map(draft.parts.map((p) => [p.id, p.name])), [draft]);
  // One callout per letter: identical parts don't need two.
  const firstOfEach = useMemo(() => new Set(labels.groups.map((g) => g.partIds[0]!)), [labels]);
  const o = draft.overall;

  const edit = (next: Spec) => {
    setDraft(next);
    setDirty(true);
  };
  const discard = () => {
    setDraft(version.spec);
    setDirty(false);
  };
  const fitOverall = () => {
    const b = pieceBox(draft);
    edit({
      ...draft,
      overall: {
        width: { value: b.max.x - b.min.x, confidence: o.width.confidence },
        height: { value: b.max.y - b.min.y, confidence: o.height.confidence },
        depth: { value: b.max.z - b.min.z, confidence: o.depth.confidence },
      },
    });
  };
  const select = (id: string) => {
    setSelected(id);
    if (narrow) setPanel('inspector');
  };

  const partsList = (
    <PartsList spec={draft} labels={labels} selected={selected} flagged={flagged} onSelect={(id) => { setSelected(id); if (narrow) setPanel('inspector'); }} />
  );
  const inspector = <Inspector spec={draft} labels={labels} selected={selected} onChange={edit} />;

  return (
    <div className={styles.workspace}>
      <div className={styles.toolbar}>
        <div className={styles.status}>
          {errors.length === 0 ? (
            <span className={styles.ok}>
              <Check size={16} aria-hidden="true" />
              Parts add up to {mm(o.width.value)} × {mm(o.height.value)} × {mm(o.depth.value)}
            </span>
          ) : (
            <span className={styles.bad}>
              <AlertTriangle size={16} aria-hidden="true" />
              {plural(errors.length, 'problem')} to fix
            </span>
          )}
          <Badge>
            v{version.version} · {version.source === 'user' ? 'edited by you' : 'by the AI'}
          </Badge>
        </div>
        {narrow && (
          <div className={styles.row}>
            <Button icon={<ListTree size={16} aria-hidden="true" />} onClick={() => setPanel('parts')}>
              Parts
            </Button>
            <Button icon={<PanelRight size={16} aria-hidden="true" />} onClick={() => setPanel('inspector')} disabled={!selected}>
              Selected part
            </Button>
          </div>
        )}
        {dirty && (
          <div className={styles.row}>
            <Button variant="ghost" icon={<Undo2 size={16} aria-hidden="true" />} onClick={discard}>
              Discard
            </Button>
            <Button variant="primary" onClick={() => save.mutate({ id: projectId, data: { spec: draft } })} disabled={save.isPending}>
              Save as v{version.version + 1}
            </Button>
          </div>
        )}
      </div>
      {save.isError && <Callout tone="danger">{save.error.message}</Callout>}

      <div className={styles.columns}>
        {!narrow && <aside className={styles.left}>{partsList}</aside>}

        <main className={styles.main}>
          {issues.length > 0 && <IssueList issues={issues} letters={letters} names={names} onSelect={select} onFitOverall={fitOverall} />}
          <Tabs
            label="Sheets"
            items={[
              {
                value: 'views',
                label: 'Views',
                content: (
                  <div className={styles.sheet}>
                    <OrthoDrawing spec={draft} selected={selected} flagged={flagged} onSelect={select} />
                    <TitleBlock name={name} sheet="General arrangement" version={version.version} />
                  </div>
                ),
              },
              {
                value: 'model',
                label: '3D',
                content: <ModelSheet spec={draft} letters={letters} callouts={firstOfEach} selected={selected} onSelect={select} name={name} version={version.version} />,
              },
              { value: 'parts', label: 'Part sheets', content: <PartSheets spec={draft} fixings={fixings} labels={labels} onSelect={select} /> },
              { value: 'cut', label: 'Cut list', content: <CutList spec={draft} /> },
              { value: 'notes', label: 'Notes', content: <NotesSheet spec={draft} /> },
            ]}
          />
        </main>

        {!narrow && <aside className={styles.right}>{inspector}</aside>}
      </div>

      {narrow && (
        <>
          <Dialog variant="sheet" open={panel === 'parts'} onOpenChange={(o) => setPanel(o ? 'parts' : null)} title="Parts">
            {partsList}
          </Dialog>
          <Dialog variant="sheet" open={panel === 'inspector'} onOpenChange={(o) => setPanel(o ? 'inspector' : null)} title="Selected part">
            {inspector}
          </Dialog>
        </>
      )}
    </div>
  );
}

interface ModelSheetProps {
  spec: Spec;
  letters: Map<string, string>;
  callouts: Set<string>;
  selected: string | null;
  onSelect: (id: string) => void;
  name: string;
  version: number;
}

function ModelSheet({ spec, letters, callouts, selected, onSelect, name, version }: ModelSheetProps) {
  const [mode, setMode] = useState<'exploded' | 'assembled'>('exploded');
  const items = mode === 'exploded' ? explodedItems(spec) : spec.parts.map((part) => ({ part }));
  return (
    <div className={styles.sheet}>
      <div className={styles.sheetTools}>
        <SegmentedControl
          label="Show"
          value={mode}
          onValueChange={setMode}
          options={[
            { value: 'exploded', label: 'Exploded' },
            { value: 'assembled', label: 'Assembled' },
          ]}
        />
      </div>
      <div className={styles.iso}>
        <IsoDrawing
          items={items}
          letters={letters}
          selected={selected}
          highlight={selected ? new Set([selected]) : undefined}
          callouts={mode === 'exploded' ? callouts : new Set()}
          onSelect={onSelect}
          label={`${mode === 'exploded' ? 'Exploded' : 'Assembled'} view of the ${spec.name}, with each part lettered.`}
        />
      </div>
      <TitleBlock name={name} sheet={mode === 'exploded' ? 'Exploded view' : 'Assembled view'} version={version} />
    </div>
  );
}

function NotesSheet({ spec }: { spec: Spec }) {
  return (
    <div className={`${styles.sheet} ${styles.notes}`}>
      <section>
        <h3>Scale</h3>
        <p>{spec.reference || 'No reference measurement was recorded.'}</p>
      </section>
      <section>
        <h3>Assumptions</h3>
        <p className={styles.muted}>Designed or guessed, not seen in the photos. Check these before cutting.</p>
        {spec.assumptions.length ? (
          <ul>
            {spec.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : (
          <p>None.</p>
        )}
      </section>
      {spec.simplifications.length > 0 && (
        <section>
          <h3>Simplified</h3>
          <ul>
            {spec.simplifications.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function TitleBlock({ name, sheet, version }: { name: string; sheet: string; version: number }) {
  return (
    <dl className={styles.titleBlock}>
      <div className={styles.titleCell}>
        <dt>Title</dt>
        <dd>
          {name} · {sheet}
        </dd>
      </div>
      <div>
        <dt>Units</dt>
        <dd>mm</dd>
      </div>
      <div>
        <dt>Scale</dt>
        <dd>Not to scale</dd>
      </div>
      <div>
        <dt>Version</dt>
        <dd>v{version}</dd>
      </div>
    </dl>
  );
}
