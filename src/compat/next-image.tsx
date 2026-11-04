import React from 'react';

export default function Image({ src, alt, width, height, className, priority, unoptimized, ...props }: any) {
  const imgSrc = typeof src === 'object' && src !== null ? src.src || '' : src;
  return (
    <img
      src={imgSrc}
      alt={alt || ''}
      width={width}
      height={height}
      className={className}
      loading={priority ? 'eager' : 'lazy'}
      {...props}
    />
  );
}

