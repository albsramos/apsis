import { Tabs as RadixTabs } from 'radix-ui';
import type { ReactNode } from 'react';
import styles from './Tabs.module.css';

export interface TabItem {
  value: string;
  label: ReactNode;
  content: ReactNode;
}

export interface TabsProps {
  label: string;
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

export function Tabs({ label, items, value, defaultValue, onValueChange }: TabsProps) {
  return (
    <RadixTabs.Root
      value={value}
      defaultValue={defaultValue ?? items[0]?.value}
      onValueChange={onValueChange}
      className={styles.root}
    >
      <RadixTabs.List aria-label={label} className={styles.list}>
        {items.map((t) => (
          <RadixTabs.Trigger key={t.value} value={t.value} className={styles.trigger}>
            {t.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((t) => (
        <RadixTabs.Content key={t.value} value={t.value} className={styles.content}>
          {t.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
