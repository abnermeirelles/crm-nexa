import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ClsService } from 'nestjs-cls';
import {
  ROLE_KEY,
  SID_KEY,
  TENANT_ID_KEY,
  USER_ID_KEY,
} from '../../../common/cls/keys';
import type { AuthenticatedUser, JwtAccessPayload } from '../types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService, private readonly cls: ClsService) {
    const secret = config.get<string>('jwt.accessSecret');
    if (!secret) throw new Error('jwt.accessSecret missing in config');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      algorithms: ['HS256'],
    });
  }

  validate(payload: JwtAccessPayload): AuthenticatedUser {
    if (!payload?.sub || !payload.tenantId || !payload.role || !payload.sid) {
      throw new UnauthorizedException('Invalid token payload');
    }
    this.cls.set(USER_ID_KEY, payload.sub);
    this.cls.set(TENANT_ID_KEY, payload.tenantId);
    this.cls.set(ROLE_KEY, payload.role);
    this.cls.set(SID_KEY, payload.sid);
    return {
      id: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      sid: payload.sid,
    };
  }
}
