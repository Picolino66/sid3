import type { Request } from 'express';

export type CurrentUser = {
  id: string;
  email: string;
};

export type JwtPayload = {
  sub: string;
  email: string;
};

export type AuthenticatedRequest = Request & {
  user: CurrentUser;
};
