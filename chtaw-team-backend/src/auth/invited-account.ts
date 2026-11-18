// Principal administrators never enter the invitation lifecycle.
export function isInvitedAccount(user: { role: string; isInvitedAdmin?: boolean }) {
  return user.role === "COLLABORATOR" || (user.role === "ADMIN" && user.isInvitedAdmin === true);
}
