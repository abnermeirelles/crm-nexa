import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ClsServiceManager } from 'nestjs-cls';
import { TENANT_ID_KEY } from '../cls/keys';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, _ctx: ExecutionContext): string | undefined => {
    return ClsServiceManager.getClsService().get<string>(TENANT_ID_KEY);
  },
);
