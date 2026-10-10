import { FC, SVGProps } from 'react';

export type DSynqLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;

export interface DSynqLogoProps extends Omit<SVGProps<SVGSVGElement>, 'size'> {
  size?: DSynqLogoSize;
  interactive?: boolean;
  className?: string;
  glow?: boolean;
}

const sizeMap: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', { width: number; height: number }> = {
  xs: { width: 16, height: 16 },
  sm: { width: 24, height: 24 },
  md: { width: 36, height: 36 },
  lg: { width: 48, height: 48 },
  xl: { width: 64, height: 64 },
};

/**
 * Official DSynq Brand Emblem
 * Features official coral-red geometry with global soft-glow effect.
 * Preserves exact geometric proportions and path data from the master brand reference.
 */
export const DSynqLogo: FC<DSynqLogoProps> = ({
  size = 'md',
  interactive = false,
  className = '',
  glow = true,
  style,
  ...props
}) => {
  const dimensions =
    typeof size === 'number'
      ? { width: size, height: size }
      : sizeMap[size] ?? sizeMap.md;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      width={dimensions.width}
      height={dimensions.height}
      role="img"
      aria-label="DSynq Logo"
      overflow="visible"
      data-interactive={interactive ? 'true' : 'false'}
      className={`shrink-0 select-none ${glow ? 'dsynq-logo' : ''} ${
        interactive ? 'is-interactive cursor-pointer' : 'is-static pointer-events-none'
      } ${className}`.trim()}
      style={style}
      {...props}
    >
      <path
        d="M 166 218 
           L 540 218 
           A 282 282 0 0 1 540 782 
           L 166 782 
           L 352 500 
           Z 
           M 354 346 
           L 448 500 
           L 354 654 
           L 540 654 
           A 154 154 0 0 0 540 346 
           Z"
        fill="#FF4B55"
        fillRule="evenodd"
      />
    </svg>
  );
};

export default DSynqLogo;
