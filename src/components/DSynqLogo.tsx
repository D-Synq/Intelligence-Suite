import { FC, SVGProps } from 'react';

export type DSynqLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;

export interface DSynqLogoProps extends Omit<SVGProps<SVGSVGElement>, 'size'> {
  size?: DSynqLogoSize;
  interactive?: boolean;
  className?: string;
  glow?: boolean;
  variant?: 'svg' | 'image' | 'badge';
  alt?: string;
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
 * Features the official coral-red mark (#FF4B55) with exact geometric pathing.
 * Supports vector SVG rendering (lossless scaling at any resolution) or master raster image asset.
 */
export const DSynqLogo: FC<DSynqLogoProps> = ({
  size = 'md',
  interactive = false,
  className = '',
  glow = true,
  variant = 'svg',
  alt = 'DSynq Logo',
  style,
  ...props
}) => {
  const dimensions =
    typeof size === 'number'
      ? { width: size, height: size }
      : sizeMap[size] ?? sizeMap.md;

  if (variant === 'image') {
    return (
      <img
        src="/brand/logo.png"
        alt={alt}
        width={dimensions.width}
        height={dimensions.height}
        loading="eager"
        decoding="async"
        className={`shrink-0 select-none object-contain rounded-lg ${glow ? 'dsynq-logo' : ''} ${
          interactive ? 'is-interactive cursor-pointer' : 'is-static pointer-events-none'
        } ${className}`.trim()}
        style={{ width: dimensions.width, height: dimensions.height, ...style }}
      />
    );
  }

  if (variant === 'badge') {
    return (
      <div
        className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-black border border-[#252A3B] p-2 shadow-md ${
          interactive ? 'cursor-pointer hover:border-brand/40 transition-colors' : ''
        } ${className}`.trim()}
        style={{ width: dimensions.width + 16, height: dimensions.height + 16 }}
      >
        <DSynqLogo
          size={size}
          interactive={interactive}
          glow={glow}
          style={style}
          {...props}
        />
      </div>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      width={dimensions.width}
      height={dimensions.height}
      role="img"
      aria-label={alt}
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
