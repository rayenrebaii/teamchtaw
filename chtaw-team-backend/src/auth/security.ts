import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { Actor } from "../common/access";
export const Public = () => SetMetadata("public", true);
export const AllowUnapproved = () => SetMetadata("unapproved", true);
export const Admin = () => SetMetadata("admin", true);
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Actor =>
    ctx.switchToHttp().getRequest<{ user: Actor }>().user,
);
@Injectable()
export class JwtGuard extends AuthGuard("jwt") {
  constructor(private reflector: Reflector) {
    super();
  }
  canActivate(ctx: ExecutionContext) {
    if (
      ctx.getType() !== "http" ||
      this.reflector.getAllAndOverride<boolean>("public", [ctx.getHandler(), ctx.getClass()])
    )
      return true;
    return super.canActivate(ctx);
  }
}
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    if (
      ctx.getType() !== "http" ||
      this.reflector.getAllAndOverride<boolean>("public", [ctx.getHandler(), ctx.getClass()])
    )
      return true;
    const user = ctx.switchToHttp().getRequest<{ user: Actor }>().user;
    if (
      !this.reflector.getAllAndOverride<boolean>("unapproved", [
        ctx.getHandler(),
        ctx.getClass(),
      ]) &&
      (user.status !== "APPROVED" || user.emailVerified === false)
    )
      throw new ForbiddenException("Compte non approuvé.");
    if (
      this.reflector.getAllAndOverride<boolean>("admin", [ctx.getHandler(), ctx.getClass()]) &&
      user.role !== "ADMIN"
    )
      throw new ForbiddenException("Administrateur requis.");
    return true;
  }
}
