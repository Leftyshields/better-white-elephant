/**
 * Gift product image with consistent placeholder when missing or broken.
 */
import { useEffect, useState } from 'react';
import { GiftIcon } from '@heroicons/react/24/outline';

export function GiftImage({
  src,
  alt = 'Gift',
  className = '',
  imgClassName = 'w-full h-full object-cover',
  placeholderClassName = 'w-full h-full flex items-center justify-center',
  iconClassName = 'text-white opacity-50',
  iconSize = 'w-16 h-16',
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showPlaceholder = !src || failed;

  if (showPlaceholder) {
    return (
      <div
        className={`bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 ${placeholderClassName} ${className}`}
        aria-hidden={!alt}
      >
        <GiftIcon className={`${iconSize} ${iconClassName}`} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`${imgClassName} ${className}`}
      onError={() => setFailed(true)}
    />
  );
}