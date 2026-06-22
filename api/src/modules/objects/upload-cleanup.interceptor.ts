import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { unlink } from 'fs/promises';
import { Observable, finalize } from 'rxjs';

@Injectable()
export class UploadCleanupInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { file?: Express.Multer.File }>();

    return next.handle().pipe(
      finalize(() => {
        if (request.file?.path) {
          void unlink(request.file.path).catch(() => undefined);
        }
      })
    );
  }
}
