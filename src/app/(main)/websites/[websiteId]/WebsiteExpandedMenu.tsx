import { NavMenu } from '@/components/common/NavMenu';
import { useMessages } from '@/components/hooks';
import {
  Globe,
  KeyRound,
  Landmark,
  Layers,
  Link2,
  LogIn,
  LogOut,
  MapPin,
  Megaphone,
  Monitor,
  Network,
  Search,
  Send,
  Share2,
  Smartphone,
  SquareSlash,
  Target,
  Type,
} from '@/components/icons';

export function WebsiteExpandedMenu({
  excludedIds = [],
  onItemClick,
  selectedView,
  onViewChange,
}: {
  excludedIds?: string[];
  onItemClick?: () => void;
  selectedView: string;
  onViewChange: (view: string) => void;
}) {
  const { t, labels } = useMessages();
  const activeView = selectedView;

  const filterExcluded = (item: { id: string }) => !excludedIds.includes(item.id);

  const items = [
    {
      label: 'URL',
      items: [
        {
          id: 'path',
          label: t(labels.path),
          icon: <SquareSlash />,
        },
        {
          id: 'entry',
          label: t(labels.entry),
          icon: <LogIn />,
        },
        {
          id: 'exit',
          label: t(labels.exit),
          icon: <LogOut />,
        },
        {
          id: 'title',
          label: t(labels.title),
          icon: <Type />,
        },
        {
          id: 'query',
          label: t(labels.query),
          icon: <Search />,
        },
      ].filter(filterExcluded),
    },
    {
      label: t(labels.sources),
      items: [
        {
          id: 'referrer',
          label: t(labels.referrer),
          icon: <Share2 />,
        },
        {
          id: 'channel',
          label: t(labels.channel),
          icon: <Megaphone />,
        },
        {
          id: 'keywords',
          label: 'Keywords',
          icon: <Search />,
        },
        {
          id: 'domain',
          label: t(labels.domain),
          icon: <Globe />,
        },
      ].filter(filterExcluded),
    },
    {
      label: t(labels.utm),
      items: [
        {
          id: 'utmSource',
          label: t(labels.source),
          icon: <Link2 />,
        },
        {
          id: 'utmMedium',
          label: t(labels.medium),
          icon: <Send />,
        },
        {
          id: 'utmCampaign',
          label: t(labels.campaign),
          icon: <Target />,
        },
        {
          id: 'utmContent',
          label: t(labels.content),
          icon: <Layers />,
        },
        {
          id: 'utmTerm',
          label: t(labels.term),
          icon: <KeyRound />,
        },
      ].filter(filterExcluded),
    },
    {
      label: t(labels.location),
      items: [
        {
          id: 'country',
          label: t(labels.country),
          icon: <MapPin />,
        },
        {
          id: 'region',
          label: t(labels.region),
          icon: <Landmark />,
        },
        {
          id: 'city',
          label: t(labels.city),
          icon: <MapPin />,
        },
      ].filter(filterExcluded),
    },
    {
      label: t(labels.environment),
      items: [
        {
          id: 'browser',
          label: t(labels.browser),
          icon: <Globe />,
        },
        {
          id: 'os',
          label: t(labels.os),
          icon: <Monitor />,
        },
        {
          id: 'device',
          label: t(labels.device),
          icon: <Smartphone />,
        },
      ].filter(filterExcluded),
    },
    {
      label: t(labels.other),
      items: [
        {
          id: 'hostname',
          label: t(labels.hostname),
          icon: <Network />,
        },
      ].filter(filterExcluded),
    },
  ];

  return (
    <NavMenu
      items={items}
      selectedKey={activeView}
      variant="talivia"
      onItemClick={onItemClick}
      onItemSelect={onViewChange}
    />
  );
}
