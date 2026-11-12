/**
 * How to Play page (public rules at /how-to-play)
 */
import { RulesPageContent } from '../components/RulesPageContent.jsx';
import { SEO } from '../components/SEO.jsx';

export function HowToPlay() {
  return (
    <>
      <SEO
        title="How to Play StealOrReveal"
        description="Learn how to play StealOrReveal: White Elephant gift exchange rules, stealing, freezing, and fulfillment for remote teams."
        url="/how-to-play"
      />
      <RulesPageContent pageTitle="How to Play" />
    </>
  );
}
