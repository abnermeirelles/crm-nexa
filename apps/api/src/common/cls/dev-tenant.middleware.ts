import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { TENANT_ID_KEY } from './keys';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class DevTenantMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    if (process.env.NODE_ENV === 'production') {
      next();
      return;
    }
    const headerValue = req.header('x-dev-tenant-id');
    if (typeof headerValue === 'string' && UUID_RE.test(headerValue)) {
      this.cls.set(TENANT_ID_KEY, headerValue.toLowerCase());
    }
    next();
  }
}
