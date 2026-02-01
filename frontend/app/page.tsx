
import Dashboard from './components/Dashboard';

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const filterParam = params?.filter;
  const rawFilter = Array.isArray(filterParam) ? filterParam[0] : filterParam;
  const initialFilter = rawFilter === 'applications' ? 'applications' : 'all';

  return <Dashboard initialFilter={initialFilter} />;
}
