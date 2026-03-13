
import Listings from '../listings/components/Listings';

export default function ArchivePage() {
    return <Listings initialFilter="all" isArchived={true} />;
}
