import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma, Role, AccountStatus } from "@prisma/client";
import { userSelect } from "./presenters";
export interface Actor {
  id: string;
  sessionId: string;
  role: Role;
  status: AccountStatus;
  email: string;
  firstName: string;
  lastName: string;
  bio: string;
  joinedAt: Date;
  emailVerified?: boolean;
}
@Injectable()
export class AccessService {
  async actor(
    tx: Prisma.TransactionClient,
    actor: Actor,
    requireApproved = true,
    requireAdmin = false,
  ) {
    const session = await tx.refreshSession.findUnique({
      where: { id: actor.sessionId },
      include: { user: { select: userSelect } },
    });
    if (
      !session ||
      session.userId !== actor.id ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      throw new UnauthorizedException("Session expirée.");
    const user = session.user;
    if (user.disabledAt) throw new UnauthorizedException("Compte désactivé.");
    if (requireApproved && actor.emailVerified === false)
      throw new ForbiddenException("Vérifiez votre adresse e-mail.");
    if (requireApproved && user.status !== "APPROVED")
      throw new ForbiddenException("Compte non approuvé.");
    if (requireAdmin && user.role !== "ADMIN")
      throw new ForbiddenException("Administrateur requis.");
    return user;
  }
  async organizer(tx: Prisma.TransactionClient, actor: Actor) {
    const user = await this.actor(tx, actor);
    if (user.role !== "ADMIN" && user.role !== "COLLABORATOR")
      throw new ForbiddenException("Organisateur requis.");
    return user;
  }
  async session(tx: Prisma.TransactionClient, actor: Actor, id: string) {
    const poll = await tx.poll.findUnique({ where: { id }, select: { groupId: true, authorId: true } });
    if (!poll) throw new NotFoundException("Séance introuvable.");
    await this.group(tx, actor, poll.groupId);
    await this.organizer(tx, actor);
    if (poll.authorId !== actor.id) throw new ForbiddenException("Cette séance appartient à un autre organisateur.");
    return poll;
  }
  async lockGroup(tx: Prisma.TransactionClient, groupId: string) {
    await tx.$queryRaw`SELECT id FROM "Group" WHERE id = ${groupId}::uuid FOR UPDATE`;
    const group = await tx.group.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException("Groupe introuvable.");
    return group;
  }
  async group(tx: Prisma.TransactionClient, actor: Actor, groupId: string, admin = false) {
    const group = await this.lockGroup(tx, groupId);
    await this.actor(tx, actor, true, admin);
    const member = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: actor.id } },
    });
    if (!member) throw new ForbiddenException("Vous ne faites pas partie de ce groupe.");
    return group;
  }
}
