import { Link } from 'react-router';
import { Page, TopBar } from '@/components/layout';

export function NotFoundPage() {
  return (
    <Page bar={<TopBar />} width="narrow">
      <h1>Not found</h1>
      <p>
        There's nothing here. <Link to="/">Back to your pieces</Link>
      </p>
    </Page>
  );
}
