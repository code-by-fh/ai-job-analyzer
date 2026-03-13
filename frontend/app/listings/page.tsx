
import Listings from './components/Listings';

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const filterParam = params?.filter;
  const rawFilter = Array.isArray(filterParam) ? filterParam[0] : filterParam;
  const validFilters = ['all', 'favorite', 'no_favorite', 'applications'];
  const initialFilter = validFilters.includes(rawFilter || '') ? (rawFilter as any) : 'all';

  const platformIdParam = params?.platform_id;
  const rawPlatformId = Array.isArray(platformIdParam) ? platformIdParam[0] : platformIdParam;
  const initialPlatformId = rawPlatformId ? parseInt(rawPlatformId, 10) : undefined;
  const platformNameParam = params?.platform_name;
  const initialPlatformName = (Array.isArray(platformNameParam) ? platformNameParam[0] : platformNameParam) as string | undefined;

  return <Listings initialFilter={initialFilter} initialPlatformId={initialPlatformId} initialPlatformName={initialPlatformName} />;
}
