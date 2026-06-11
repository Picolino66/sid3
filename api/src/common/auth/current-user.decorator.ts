import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest, CurrentUser } from './types';

export const CurrentUserContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  }
);
