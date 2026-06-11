import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiKeyAuthenticatedRequest, ApiKeyAuthContext } from './api-key-auth.guard';

export const CurrentApiKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ApiKeyAuthContext => {
    const request = context.switchToHttp().getRequest<ApiKeyAuthenticatedRequest>();
    return request.apiKeyAuth;
  }
);
