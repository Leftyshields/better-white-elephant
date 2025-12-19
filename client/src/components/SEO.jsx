/**
 * SEO Component
 * Reusable component for managing meta tags, Open Graph, and Twitter Cards
 */
import { Helmet } from 'react-helmet-async';

const BASE_URL = 'https://stealorreveal.com';
const DEFAULT_IMAGE = '/og-image.png';

export function SEO({ title, description, image, url }) {
  // Construct full title with suffix
  const fullTitle = title ? `${title} | StealOrReveal` : 'StealOrReveal';
  
  // Construct full URL
  const fullUrl = url ? `${BASE_URL}${url}` : BASE_URL;
  
  // Construct full image URL
  const fullImage = image ? (image.startsWith('http') ? image : `${BASE_URL}${image}`) : `${BASE_URL}${DEFAULT_IMAGE}`;
  
  return (
    <Helmet>
      {/* Standard Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      
      {/* Open Graph Tags */}
      <meta property="og:title" content={title || 'StealOrReveal'} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={fullImage} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="StealOrReveal" />
      
      {/* Twitter Card Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title || 'StealOrReveal'} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullImage} />
    </Helmet>
  );
}













