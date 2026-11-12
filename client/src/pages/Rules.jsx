/**
 * Rules Page - Public game rules and instructions
 */
import { SEO } from '../components/SEO.jsx';
import { RulesContent } from '../components/RulesContent.jsx';
import { RULES_SEO } from '../utils/landingMarketingCopy.js';

export function Rules() {
  return (
    <>
      <SEO title={RULES_SEO.rulesTitle} description={RULES_SEO.description} url="/rules" />
      <RulesContent pageHeading="Rules" />
    </>
  );
}
