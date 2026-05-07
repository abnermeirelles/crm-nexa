import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ClsServiceManager } from 'nestjs-cls';
import { ROLE_KEY, USER_ID_KEY } from '../cls/keys';

export interface CurrentUserContext {
  id: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, _ctx: ExecutionContext): CurrentUserContext | undefined => {
    const cls = ClsServiceManager.getClsService();
    const id = cls.get<string>(USER_ID_KEY);
    const role = cls.get<string>(ROLE_KEY);
    if (!id || !role) return undefined;
    return { id, role };
  },
);
