// Gumpa — backend. Auth, social feed, friends, and quest-photo
// verification, all in one small Worker backed by D1 (users/posts/friends),
// R2 (photo storage), and KV (rate limiting).

import { handleRecommend, handleSetAvatar, handleSetPrivacy } from './account';
import {
  handleLogin,
  handleMe,
  handleRequestPasswordReset,
  handleResendVerification,
  handleResetPassword,
  handleResetPasswordPage,
  handleSignup,
  handleVerifyEmail,
} from './auth';
import {
  handleAdminCancelBoost,
  handleAdminCreateBoost,
  handleAdminListBoosts,
  handleListActiveBoosts,
} from './boosts';
import { handleAddComment, handleListComments } from './comments';
import { handleComplete } from './complete';
import {
  handleAdminCreateChallenge,
  handleAdminDeleteChallenge,
  handleAdminListChallenges,
  handleAdminPermanentlyDeleteChallenge,
  handleAdminPreviewPrompt,
  handleAdminUpdateChallenge,
  handleListCustomChallenges,
} from './dev-challenges';
import { handleCancelDuel, handleCreateDuel, handleListDuels, handleRespondDuel } from './duels';
import type { Env } from './env';
import { handleDeletePost, handleGetPhoto, handleListFeed, handleListMyPosts, handleToggleKudos } from './feed';
import { handleFriendRequest, handleFriendRespond, handleListFriends, handleSearchUsers } from './friends';
import { handleCreateGroup, handleGetGroup, handleJoinGroup, handleListMyGroups } from './groups';
import { CORS_HEADERS, error } from './http';
import { handleGetLocalChallenges } from './local-challenges';
import { handleCreatePot, handleGetPot, handleJoinPot, handleListGroupPots } from './pots';
import { handleRedeemReward, handleRewardsInterest } from './rewards';
import { handleListStoreCatalog } from './store';
import { handleRevenueCatWebhook } from './subscriptions';
import {
  handleAdminCreateTimedChallenge,
  handleAdminDeleteTimedChallenge,
  handleAdminListTimedChallenges,
  handleAdminUpdateTimedChallenge,
  handleListTimedChallenges,
} from './timed-challenges';
import { handleGetBalance } from './tokens';
import { handleVerify } from './verify';

export type { Env };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);
    const { method } = request;

    if (method === 'POST' && pathname === '/verify') return handleVerify(request, env);

    if (method === 'POST' && pathname === '/auth/signup') return handleSignup(request, env);
    if (method === 'POST' && pathname === '/auth/login') return handleLogin(request, env);
    if (method === 'GET' && pathname === '/auth/me') return handleMe(request, env);
    if (method === 'GET' && pathname === '/auth/verify') return handleVerifyEmail(request, env);
    if (method === 'POST' && pathname === '/auth/resend-verification') return handleResendVerification(request, env);
    if (method === 'POST' && pathname === '/auth/request-password-reset') return handleRequestPasswordReset(request, env);
    if (method === 'GET' && pathname === '/auth/reset-password-page') return handleResetPasswordPage(request, env);
    if (method === 'POST' && pathname === '/auth/reset-password') return handleResetPassword(request, env);

    if (method === 'POST' && pathname === '/account/privacy') return handleSetPrivacy(request, env);
    if (method === 'POST' && pathname === '/account/avatar') return handleSetAvatar(request, env);
    if (method === 'POST' && pathname === '/account/recommend') return handleRecommend(request, env);

    if (method === 'POST' && pathname === '/complete') return handleComplete(request, env);
    if (method === 'GET' && pathname === '/feed/public') return handleListFeed(request, env, 'public');
    if (method === 'GET' && pathname === '/feed/friends') return handleListFeed(request, env, 'friends');
    if (method === 'GET' && pathname === '/posts/mine') return handleListMyPosts(request, env);
    if (method === 'GET' && pathname.startsWith('/photos/')) return handleGetPhoto(env, pathname.slice('/photos/'.length));

    const kudosMatch = method === 'POST' ? pathname.match(/^\/posts\/([^/]+)\/kudos$/) : null;
    if (kudosMatch) return handleToggleKudos(request, env, kudosMatch[1]);

    const deletePostMatch = method === 'DELETE' ? pathname.match(/^\/posts\/([^/]+)$/) : null;
    if (deletePostMatch) return handleDeletePost(request, env, deletePostMatch[1]);

    const listCommentsMatch = method === 'GET' ? pathname.match(/^\/posts\/([^/]+)\/comments$/) : null;
    if (listCommentsMatch) return handleListComments(request, env, listCommentsMatch[1]);
    const addCommentMatch = method === 'POST' ? pathname.match(/^\/posts\/([^/]+)\/comments$/) : null;
    if (addCommentMatch) return handleAddComment(request, env, addCommentMatch[1]);

    if (method === 'GET' && pathname === '/users/search') return handleSearchUsers(request, env);
    if (method === 'POST' && pathname === '/friends/request') return handleFriendRequest(request, env);
    if (method === 'POST' && pathname === '/friends/respond') return handleFriendRespond(request, env);
    if (method === 'GET' && pathname === '/friends') return handleListFriends(request, env);

    if (method === 'POST' && pathname === '/groups') return handleCreateGroup(request, env);
    if (method === 'POST' && pathname === '/groups/join') return handleJoinGroup(request, env);
    if (method === 'GET' && pathname === '/groups') return handleListMyGroups(request, env);
    const groupMatch = method === 'GET' ? pathname.match(/^\/groups\/([^/]+)$/) : null;
    if (groupMatch) return handleGetGroup(request, env, groupMatch[1]);

    if (method === 'GET' && pathname === '/tokens/me') return handleGetBalance(request, env);
    if (method === 'POST' && pathname === '/rewards/interest') return handleRewardsInterest(request, env);
    if (method === 'POST' && pathname === '/rewards/redeem') return handleRedeemReward(request, env);
    if (method === 'POST' && pathname === '/webhooks/revenuecat') return handleRevenueCatWebhook(request, env);
    if (method === 'GET' && pathname === '/store/catalog') return handleListStoreCatalog(request, env);
    if (method === 'GET' && pathname === '/local-challenges') return handleGetLocalChallenges(request, env);
    if (method === 'GET' && pathname === '/challenges/custom') return handleListCustomChallenges(request, env);
    if (method === 'GET' && pathname === '/boosts/active') return handleListActiveBoosts(request, env);
    if (method === 'GET' && pathname === '/timed-challenges') return handleListTimedChallenges(request, env);

    // Developer-only — see requireDeveloper in auth.ts. A non-developer
    // request falls through to the catch-all 404 below the same as any
    // other unmatched route, never a distinguishing 401/403.
    if (method === 'GET' && pathname === '/admin/challenges') return handleAdminListChallenges(request, env);
    if (method === 'POST' && pathname === '/admin/challenges') return handleAdminCreateChallenge(request, env);
    const updateChallengeMatch = method === 'PATCH' ? pathname.match(/^\/admin\/challenges\/([^/]+)$/) : null;
    if (updateChallengeMatch) return handleAdminUpdateChallenge(request, env, updateChallengeMatch[1]);
    const deleteChallengeMatch = method === 'DELETE' ? pathname.match(/^\/admin\/challenges\/([^/]+)$/) : null;
    if (deleteChallengeMatch) return handleAdminDeleteChallenge(request, env, deleteChallengeMatch[1]);
    const permanentDeleteMatch = method === 'DELETE' ? pathname.match(/^\/admin\/challenges\/([^/]+)\/permanent$/) : null;
    if (permanentDeleteMatch) return handleAdminPermanentlyDeleteChallenge(request, env, permanentDeleteMatch[1]);
    const previewPromptMatch = method === 'GET' ? pathname.match(/^\/admin\/challenges\/([^/]+)\/preview-prompt$/) : null;
    if (previewPromptMatch) return handleAdminPreviewPrompt(request, env, previewPromptMatch[1]);

    if (method === 'GET' && pathname === '/admin/boosts') return handleAdminListBoosts(request, env);
    if (method === 'POST' && pathname === '/admin/boosts') return handleAdminCreateBoost(request, env);
    const cancelBoostMatch = method === 'DELETE' ? pathname.match(/^\/admin\/boosts\/([^/]+)$/) : null;
    if (cancelBoostMatch) return handleAdminCancelBoost(request, env, cancelBoostMatch[1]);

    if (method === 'GET' && pathname === '/admin/timed-challenges') return handleAdminListTimedChallenges(request, env);
    if (method === 'POST' && pathname === '/admin/timed-challenges') return handleAdminCreateTimedChallenge(request, env);
    const updateTimedMatch = method === 'PATCH' ? pathname.match(/^\/admin\/timed-challenges\/([^/]+)$/) : null;
    if (updateTimedMatch) return handleAdminUpdateTimedChallenge(request, env, updateTimedMatch[1]);
    const deleteTimedMatch = method === 'DELETE' ? pathname.match(/^\/admin\/timed-challenges\/([^/]+)$/) : null;
    if (deleteTimedMatch) return handleAdminDeleteTimedChallenge(request, env, deleteTimedMatch[1]);

    const createPotMatch = method === 'POST' ? pathname.match(/^\/groups\/([^/]+)\/pots$/) : null;
    if (createPotMatch) return handleCreatePot(request, env, createPotMatch[1]);
    const listPotsMatch = method === 'GET' ? pathname.match(/^\/groups\/([^/]+)\/pots$/) : null;
    if (listPotsMatch) return handleListGroupPots(request, env, listPotsMatch[1]);
    const joinPotMatch = method === 'POST' ? pathname.match(/^\/pots\/([^/]+)\/join$/) : null;
    if (joinPotMatch) return handleJoinPot(request, env, joinPotMatch[1]);
    const getPotMatch = method === 'GET' ? pathname.match(/^\/pots\/([^/]+)$/) : null;
    if (getPotMatch) return handleGetPot(request, env, getPotMatch[1]);

    if (method === 'POST' && pathname === '/duels') return handleCreateDuel(request, env);
    if (method === 'GET' && pathname === '/duels') return handleListDuels(request, env);
    const acceptDuelMatch = method === 'POST' ? pathname.match(/^\/duels\/([^/]+)\/accept$/) : null;
    if (acceptDuelMatch) return handleRespondDuel(request, env, acceptDuelMatch[1], true);
    const declineDuelMatch = method === 'POST' ? pathname.match(/^\/duels\/([^/]+)\/decline$/) : null;
    if (declineDuelMatch) return handleRespondDuel(request, env, declineDuelMatch[1], false);
    const cancelDuelMatch = method === 'POST' ? pathname.match(/^\/duels\/([^/]+)\/cancel$/) : null;
    if (cancelDuelMatch) return handleCancelDuel(request, env, cancelDuelMatch[1]);

    return error('Not found', 404);
  },
};
