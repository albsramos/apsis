import { useQueryClient } from '@tanstack/react-query';
import { Check, CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  getGetSettingsQueryKey,
  useGetSettings,
  useTestConnection,
  useUpdateSettings,
  type Settings,
  type UpdateSettingsRequestProvider,
} from '@/api';
import { Page, TopBar } from '@/components/layout';
import { Button, Callout, Field, Input, RadioCards, Spinner } from '@/components/ui';
import styles from './SettingsPage.module.css';

export function SettingsPage() {
  const settings = useGetSettings();
  return (
    <Page
      width="narrow"
      bar={
        <TopBar
          trail={
            <>
              <span aria-hidden="true">/</span>
              <span>Settings</span>
            </>
          }
        />
      }
    >
      {settings.isPending && <Spinner label="Loading settings" />}
      {settings.isError && <Callout tone="danger">{settings.error.message}</Callout>}
      {settings.data && <SettingsForm key={settings.data.provider + settings.data.model} settings={settings.data} />}
      <p className={styles.back}>
        <Link to="/">Back to your pieces</Link>
      </p>
    </Page>
  );
}

const PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic', description: 'Claude' },
  { value: 'openai', label: 'OpenAI-compatible', description: 'OpenAI, OpenRouter, Ollama, Gemini…' },
  { value: 'demo', label: 'Demo', description: 'no AI: a sample table' },
];

function SettingsForm({ settings }: { settings: Settings }) {
  const qc = useQueryClient();
  const [provider, setProvider] = useState(settings.provider);
  const [model, setModel] = useState(settings.model);
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [key, setKey] = useState('');
  const [removeKey, setRemoveKey] = useState(false);
  const [stock, setStock] = useState(settings.stockThicknesses.join(', '));

  const save = useUpdateSettings({
    mutation: {
      onSuccess: (s) => {
        qc.setQueryData(getGetSettingsQueryKey(), s);
        setKey('');
        setRemoveKey(false);
      },
    },
  });
  const test = useTestConnection();

  const thicknesses = stock
    .split(/[,\s]+/)
    .map((s) => Number(s.replace(',', '.')))
    .filter((n) => Number.isFinite(n) && n > 0);

  const submit = () =>
    save.mutate({
      data: {
        provider: provider as UpdateSettingsRequestProvider,
        model,
        baseUrl,
        apiKey: removeKey ? '' : key ? key : undefined,
        stockThicknesses: thicknesses,
      },
    });

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div>
        <h1 className={styles.title}>AI provider</h1>
        <p className={styles.muted}>
          Any model that reads images and calls tools works. The key is stored encrypted on your server and never sent
          to the browser.
        </p>
      </div>

      <RadioCards label="Provider" value={provider} onValueChange={(v) => setProvider(v as Settings['provider'])} options={PROVIDERS} />

      {provider !== 'demo' && (
        <>
          <Field label="Model" hint={provider === 'anthropic' ? `Leave empty for ${settings.defaultModel}.` : 'The model name your provider uses.'}>
            {(id) => <Input id={id} mono value={model} onChange={(e) => setModel(e.target.value)} placeholder={provider === 'anthropic' ? settings.defaultModel : 'gpt-…'} />}
          </Field>
          <Field
            label="Base URL"
            hint={provider === 'openai' ? 'Leave empty for OpenAI. e.g. http://localhost:11434/v1 for Ollama.' : 'Leave empty unless you use a proxy.'}
          >
            {(id) => <Input id={id} mono value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…" />}
          </Field>
          <Field
            label="API key"
            hint={settings.hasKey && !removeKey ? 'A key is saved. Type a new one to replace it.' : provider === 'openai' ? 'Not needed for local models.' : undefined}
          >
            {(id) => (
              <Input
                id={id}
                type="password"
                mono
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={settings.hasKey && !removeKey ? '••••••••••••' : ''}
              />
            )}
          </Field>
          {settings.hasKey && (
            <label className={styles.check}>
              <input type="checkbox" checked={removeKey} onChange={(e) => setRemoveKey(e.target.checked)} />
              Remove the saved key
            </label>
          )}
        </>
      )}

      <div className={styles.section}>
        <h2 className={styles.heading}>Workshop</h2>
        <Field label="Board thicknesses you can buy" hint="In mm. Parts that aren't one of these get a warning.">
          {(id) => <Input id={id} mono value={stock} onChange={(e) => setStock(e.target.value)} />}
        </Field>
      </div>

      {save.isError && <Callout tone="danger">{save.error.message}</Callout>}
      {save.isSuccess && <Callout tone="success" icon={<Check size={16} aria-hidden="true" />} title="Saved" />}

      <div className={styles.actions}>
        <Button type="submit" variant="primary" size="lg" disabled={save.isPending}>
          Save
        </Button>
        <Button onClick={() => test.mutate()} disabled={test.isPending || save.isPending}>
          {test.isPending ? 'Testing…' : 'Test saved settings'}
        </Button>
      </div>
      {test.data && (
        <Callout
          tone={test.data.ok ? 'success' : 'danger'}
          icon={test.data.ok ? <Check size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}
          title={test.data.ok ? 'Working' : 'Not working'}
        >
          {test.data.message} ({(test.data.latencyMs / 1000).toFixed(1)}s)
        </Callout>
      )}
    </form>
  );
}
