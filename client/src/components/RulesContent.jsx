/**
 * Shared rules / how-to-play body (split pages differ only in H1 and route).
 */
import { Link, useNavigate } from 'react-router-dom';
import { useHostFreeGame } from '../hooks/useHostFreeGame.js';
import {
  UserGroupIcon,
  FireIcon,
  LockClosedIcon,
  ArrowPathIcon,
  TruckIcon,
  GiftIcon,
} from '@heroicons/react/24/outline';
import { LANDING_COPY } from '../utils/landingMarketingCopy.js';

export function RulesContent({ pageHeading }) {
  const navigate = useNavigate();
  const { handleHostFreeGame } = useHostFreeGame();

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-4xl mx-auto pt-24 pb-16 px-4">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="text-6xl animate-bounce">🎁</div>
            <h1 className="text-5xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300">
              {pageHeading}
            </h1>
          </div>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            Here&apos;s how a game works, from the first gift to the last steal.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-purple-500/20 p-3 rounded-xl">
                <UserGroupIcon className="w-8 h-8 text-purple-300" />
              </div>
              <h2 className="text-2xl font-bold text-white">The Basics</h2>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Everyone brings a gift link. The game randomizes the order. Your goal: end the game holding the gift you want most.
            </p>
            <div className="mt-4 pt-4 border-t border-white/5">
              <p className="text-sm text-slate-400">
                <strong className="text-slate-300">Players:</strong> At least 2 players.
              </p>
              <p className="text-sm text-slate-400 mt-1">
                <strong className="text-slate-300">Gifts:</strong> There must be at least one gift per player.
              </p>
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-500/20 p-3 rounded-xl">
                <FireIcon className="w-8 h-8 text-red-300" />
              </div>
              <h2 className="text-2xl font-bold text-white">Stealing &amp; Freezing</h2>
            </div>
            <p className="text-slate-300 leading-relaxed mb-4">
              Stealing resets the turn to the person you stole from. Watch out: after 3 steals, a gift is{' '}
              <strong className="text-cyan-300">FROZEN ❄️</strong> and can&apos;t be stolen again.
            </p>
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/5">
              <LockClosedIcon className="w-5 h-5 text-slate-400" />
              <p className="text-sm text-slate-400">
                Frozen gifts <strong className="text-slate-300">cannot</strong> be stolen, but you can still keep them if you own one.
              </p>
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-blue-500/20 p-3 rounded-xl">
                <ArrowPathIcon className="w-8 h-8 text-blue-300" />
              </div>
              <h2 className="text-2xl font-bold text-white">The Boomerang</h2>
            </div>
            <p className="text-slate-300 leading-relaxed">
              If the host turns this on, after the last player the order runs back to the start so everyone can swap again.
            </p>
            <div className="mt-4 pt-4 border-t border-white/5">
              <p className="text-sm text-slate-400">
                <strong className="text-slate-300">Standard:</strong> First everyone takes a turn, then the first player goes once more.
              </p>
              <p className="text-sm text-slate-400 mt-1">
                <strong className="text-slate-300">Boomerang:</strong> First everyone takes a turn, then the order runs in reverse.
              </p>
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-green-500/20 p-3 rounded-xl">
                <TruckIcon className="w-8 h-8 text-green-300" />
              </div>
              <h2 className="text-2xl font-bold text-white">After the game</h2>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Before the game, add a shipping address in your profile so the person mailing your gift can ship. It auto-deletes 30 days after the game ends.
            </p>
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 mb-16">
          <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
            <GiftIcon className="w-8 h-8 text-purple-300" />
            Core Rules
          </h2>

          <div className="space-y-6">
            <div className="border-l-4 border-purple-500 pl-4">
              <h3 className="text-xl font-semibold text-white mb-2">One Gift Per Person</h3>
              <p className="text-slate-300 mb-2">
                In Standard Phase, if you already have a gift, you <strong>cannot</strong> pick or steal another one. You can skip your turn to keep your gift.
              </p>
              <p className="text-slate-400 text-sm">
                <strong>Exception:</strong> Player 1 gets a final turn at the end where they can act even if they have a gift (the &quot;bookend&quot; rule).
              </p>
            </div>

            <div className="border-l-4 border-red-500 pl-4">
              <h3 className="text-xl font-semibold text-white mb-2">Steal Chains</h3>
              <p className="text-slate-300 mb-2">
                When someone steals from you, <strong>you become the active player immediately</strong>. The turn order pauses until you pick a new gift or steal from someone else.
              </p>
              <p className="text-slate-400 text-sm">
                This creates steal chains where the action can bounce between players!
              </p>
            </div>

            <div className="border-l-4 border-blue-500 pl-4">
              <h3 className="text-xl font-semibold text-white mb-2">U-Turn Prevention</h3>
              <p className="text-slate-300 mb-2">
                You <strong>cannot</strong> immediately steal back a gift that was just stolen from you on the same turn.
              </p>
              <p className="text-slate-400 text-sm">Once the turn advances, you can steal it back on your next turn.</p>
            </div>

            <div className="border-l-4 border-cyan-500 pl-4">
              <h3 className="text-xl font-semibold text-white mb-2">Boomerang Phase</h3>
              <p className="text-slate-300 mb-2">
                In Boomerang Mode, players can <strong>swap</strong> gifts even if they already have one. This is when the real strategy begins!
              </p>
              <p className="text-slate-400 text-sm">
                The turn order reverses, giving everyone a second chance to improve their gift.
              </p>
            </div>
          </div>
        </div>

        <div id="faq" className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 mb-16">
          <h2 className="text-3xl font-bold text-white mb-6">Frequently Asked Questions</h2>

          <div className="space-y-6">
            <div className="border-b border-white/5 pb-4">
              <h3 className="text-lg font-semibold text-white mb-2">Is this the same as Dirty Santa?</h3>
              <p className="text-slate-300">
                Yes. Dirty Santa, White Elephant, and similar steal-and-swap games all work here. The host sets the steal limit and whether boomerang is on.
              </p>
            </div>

            <div className="border-b border-white/5 pb-4">
              <h3 className="text-lg font-semibold text-white mb-2">Can I steal back a gift immediately?</h3>
              <p className="text-slate-300">
                No! You must pick something else or wait until your next turn. This prevents endless revenge steal loops.
              </p>
            </div>

            <div className="border-b border-white/5 pb-4">
              <h3 className="text-lg font-semibold text-white mb-2">What happens if I have no gift?</h3>
              <p className="text-slate-300">
                You must pick a wrapped gift or steal from someone. You can&apos;t skip if you don&apos;t have a gift, unless there&apos;s no gift you&apos;re allowed to take.
              </p>
            </div>

            <div className="border-b border-white/5 pb-4">
              <h3 className="text-lg font-semibold text-white mb-2">What if all gifts are frozen?</h3>
              <p className="text-slate-300">
                The game ends when every unwrapped gift is frozen and no one has a turn left. The host can also end the game.
              </p>
            </div>

            <div className="border-b border-white/5 pb-4">
              <h3 className="text-lg font-semibold text-white mb-2">Can I skip my turn if I like my gift?</h3>
              <p className="text-slate-300">
                Yes. If you have a gift you like, you can skip your turn in either phase.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-2">What happens to wrapped gifts at the end?</h3>
              <p className="text-slate-300">
                Any remaining wrapped gifts are automatically assigned to players who don&apos;t have a gift when the game ends.
              </p>
            </div>
          </div>
        </div>

        <div className="text-center">
          <Link
            to="/"
            onClick={(event) => {
              event.preventDefault();
              navigate('/');
              void handleHostFreeGame('rules_cta');
            }}
            className="inline-block bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-lg px-12 py-4 rounded-full shadow-[0_0_30px_rgba(139,92,246,0.5)] hover:shadow-[0_0_40px_rgba(139,92,246,0.7)] transform hover:scale-105 transition-all duration-300"
          >
            {LANDING_COPY.primaryCta}
          </Link>
        </div>
      </div>
    </div>
  );
}
