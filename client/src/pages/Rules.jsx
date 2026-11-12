/**
 * Rules Page - Public game rules and instructions
 */
import { RulesPageContent } from '../components/RulesPageContent.jsx';
import { SEO } from '../components/SEO.jsx';

export function Rules() {
  return (
    <>
      <SEO
        title="Official White Elephant Rules & Guide"
        description="Master the art of the steal. Learn how to play StealOrReveal with our complete guide to White Elephant gift exchange rules, stealing mechanics, and game strategies."
        url="/rules"
      />
      <RulesPageContent pageTitle="Rules" />
    </>
  );
}
