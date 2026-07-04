// Local session storage helpers — stores playerId / nickname / roomId
const KEY_PASS = "sb_pass_ok";
const KEY_PLAYER = "sb_player";

export interface PlayerSession {
  playerId: string;
  nickname: string;
  roomId: string;
  roomCode: string;
}

export const PASSCODE = "akusayangarsepat";

export function isUnlocked(): boolean {
  return localStorage.getItem(KEY_PASS) === "1";
}
export function unlock() {
  localStorage.setItem(KEY_PASS, "1");
}

// Session is persisted in localStorage so a refresh / disconnect
// can resume the same player in the same room without double-submitting.
export function getSession(): PlayerSession | null {
  const raw = localStorage.getItem(KEY_PLAYER);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
export function setSession(s: PlayerSession) {
  localStorage.setItem(KEY_PLAYER, JSON.stringify(s));
}
export function clearSession() {
  localStorage.removeItem(KEY_PLAYER);
}

export const KEY_NAME = "sb_player_name";
export function getPlayerName(): string {
  return localStorage.getItem(KEY_NAME) ?? "";
}
export function setPlayerName(name: string) {
  if (name.trim()) localStorage.setItem(KEY_NAME, name.trim());
}
export function clearPlayerName() {
  localStorage.removeItem(KEY_NAME);
}

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/**
 * For step index s (0..numPlayers-1) and chain owner at seat o,
 * the assigned author is at seat (o + s) % numPlayers.
 * This guarantees:
 *  - step 0 (sentence) = chain owner themselves
 *  - each player works on exactly one chain per step
 *  - players never see their own previous step (s>0 means different seat from s-1)
 */
export function authorSeatForStep(ownerSeat: number, stepIndex: number, numPlayers: number) {
  return (ownerSeat + stepIndex) % numPlayers;
}

export function stepKind(stepIndex: number): "sentence" | "drawing" | "guess" {
  if (stepIndex === 0) return "sentence";
  return stepIndex % 2 === 1 ? "drawing" : "guess";
}

/**
 * Removes a player from a room cleanly:
 *  - deletes the player row
 *  - deletes any chain they own (steps where chain_owner_id = leaver)
 *  - resequences remaining seats to 0..n-1 so chain math stays valid
 *  - if host, hands host to the next remaining player
 *  - if only 1 player remains AND room was playing/lobby, marks the room finished
 *  - if 0 remain, marks finished
 *  - if room was 'playing' and current_step >= remaining count, marks finished
 */
export async function leaveRoomCleanup(
  supabase: any,
  roomId: string,
  leaverId: string,
) {
  // Delete chain owned by leaver (if any)
  await supabase.from("steps").delete().eq("chain_owner_id", leaverId);
  // Delete player
  await supabase.from("players").delete().eq("id", leaverId);

  // Get remaining players ordered by seat
  const { data: rest } = await supabase
    .from("players").select("id, seat")
    .eq("room_id", roomId).order("seat", { ascending: true });
  const remaining = rest ?? [];

  // Resequence seats 0..n-1 to keep chain rotation math valid
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].seat !== i) {
      await supabase.from("players").update({ seat: i }).eq("id", remaining[i].id);
    }
  }

  const { data: room } = await supabase
    .from("rooms").select("host_id, status, current_step").eq("id", roomId).maybeSingle();
  if (!room) return;

  const updates: any = { num_players: remaining.length };

  // Reassign host if leaver was host
  if (room.host_id === leaverId && remaining.length > 0) {
    updates.host_id = remaining[0].id;
  }

  // End the game if too few players or step out of range
  if (remaining.length <= 1) {
    updates.status = "finished";
  } else if (room.status === "playing" && room.current_step >= remaining.length) {
    updates.status = "finished";
  }

  await supabase.from("rooms").update(updates).eq("id", roomId);
}

/**
 * Reset a finished/lobby room so the same players can play again.
 * Wipes all steps and returns room to lobby state.
 */
export async function restartRoom(supabase: any, roomId: string) {
  await supabase.from("steps").delete().eq("room_id", roomId);
  await supabase.from("rooms").update({
    status: "lobby",
    current_step: 0,
  }).eq("id", roomId);
}
