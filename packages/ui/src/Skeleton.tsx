export interface SkeletonProps {
  readonly width?: string
  readonly height?: string
}

/** A shimmer placeholder the size of what is loading, replacing every "Loading..." line of text. Respects prefers-reduced-motion via components.css. */
export function Skeleton({ width = '100%', height = '1em' }: SkeletonProps) {
  return <div className="ui-skeleton" style={{ width, height }} aria-hidden="true" />
}
