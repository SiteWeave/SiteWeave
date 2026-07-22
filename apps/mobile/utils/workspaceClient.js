import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_PROJECT_INVITE_KEY = 'pendingProjectInviteToken';

export async function storePendingProjectInviteToken(token) {
  if (token) {
    await AsyncStorage.setItem(PENDING_PROJECT_INVITE_KEY, token);
  }
}

export async function consumePendingProjectInviteToken() {
  const token = await AsyncStorage.getItem(PENDING_PROJECT_INVITE_KEY);
  if (token) await AsyncStorage.removeItem(PENDING_PROJECT_INVITE_KEY);
  return token;
}

export async function peekPendingProjectInviteToken() {
  return AsyncStorage.getItem(PENDING_PROJECT_INVITE_KEY);
}

let inviteBootstrapInFlight = null;
let inviteBootstrapDoneForUser = null;
let autoRedeemDoneForUser = null;

async function invokeEdgeFunction(supabase, functionName, body = {}) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data, error } = await supabase.functions.invoke(functionName, { body });

  if (error) {
    return { success: false, error: error.message };
  }
  return data ?? { success: false, error: 'Empty response' };
}

export async function provisionPersonalWorkspace(supabase, { force = false } = {}) {
  return invokeEdgeFunction(supabase, 'provision-personal-workspace', force ? { force: true } : {});
}

export async function redeemProjectInvite(supabase, { token, shortCode }) {
  return invokeEdgeFunction(supabase, 'redeem-project-invite', { token, shortCode });
}

export async function autoRedeemProjectInvites(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return { success: true, redeemedProjectIds: [], skipped: true };
  }
  if (autoRedeemDoneForUser === user.id) {
    return { success: true, skipped: true };
  }

  const result = await invokeEdgeFunction(supabase, 'auto-redeem-project-invites', {});
  if (result?.success !== false) {
    autoRedeemDoneForUser = user.id;
  }
  return result;
}

export function extractProjectInviteTokenFromUrl(urlOrPath) {
  if (!urlOrPath) return null;
  const str = String(urlOrPath);
  const match = str.match(/project-invite\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function runInviteBootstrap(supabase) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  if (inviteBootstrapDoneForUser === user.id) {
    return { success: true, skipped: true };
  }
  if (inviteBootstrapInFlight) {
    return inviteBootstrapInFlight;
  }

  inviteBootstrapInFlight = (async () => {
    try {
      const redeemedProjectIds = [];
      const pending = await peekPendingProjectInviteToken();
      let pendingRedeem = null;
      if (pending) {
        pendingRedeem = await redeemProjectInvite(supabase, { token: pending });
        if (pendingRedeem?.success) {
          await consumePendingProjectInviteToken();
          if (pendingRedeem.projectId) {
            redeemedProjectIds.push(pendingRedeem.projectId);
          }
        }
      }
      const result = await autoRedeemProjectInvites(supabase);
      if (result?.success !== false) {
        inviteBootstrapDoneForUser = user.id;
      }
      const autoIds = Array.isArray(result?.redeemedProjectIds) ? result.redeemedProjectIds : [];
      return {
        ...(result || { success: true }),
        pendingRedeem,
        redeemedProjectIds: [...new Set([...redeemedProjectIds, ...autoIds])],
      };
    } finally {
      inviteBootstrapInFlight = null;
    }
  })();

  return inviteBootstrapInFlight;
}
