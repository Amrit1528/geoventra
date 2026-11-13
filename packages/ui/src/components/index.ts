/**
 * GEOVENTRA — design-system component barrel.
 *
 * Everything the web application needs is re-exported here so imports stay
 * shallow: `import { Button, Card } from '@geoventra/ui'`.
 */

export { Badge, badgeVariantForSeverity, type BadgeProps, type BadgeSize, type BadgeVariant } from './Badge';
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './Button';
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  type CardProps,
  type CardSectionProps,
  type CardTitleProps,
} from './Card';
export { cn, Component, COMPONENT_TAGS, type ComponentProps, type ComponentTag } from './Component';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { Header, type HeaderBreadcrumb, type HeaderProps } from './Header';
export { KpiCard, type KpiCardProps, type KpiDelta, type KpiTone } from './KpiCard';
export { LoadingPanel, LoadingState, Spinner, type LoadingStateProps, type LoadingVariant, type SpinnerProps } from './LoadingState';
export { PageLayout, type PageLayoutProps } from './PageLayout';
export { Pagination, pageWindow, type PaginationProps } from './Pagination';
export { Select, type SelectOption, type SelectProps } from './Select';
export {
  Sidebar,
  SIDEBAR_NAV_ITEMS,
  isActiveRoute,
  type SidebarNavItem,
  type SidebarProps,
} from './Sidebar';
