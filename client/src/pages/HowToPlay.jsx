/**
 * How to Play page (shared body with Rules; different H1 and SEO title).
 */
import { SEO } from '../components/SEO.jsx';
import { RulesContent } from '../components/RulesContent.jsx';
import { RULES_SEO } from '../utils/landingMarketingCopy.js';

export function HowToPlay() {
  return (
    <>
      <SEO title={RULES_SEO.howToPlayTitle} description={RULES_SEO.description} url="/how-to-play" />
      <RulesContent pageHeading="How to Play" />
    </>
  );
}
