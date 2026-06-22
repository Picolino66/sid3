import { ArgumentsHost, Catch, ExceptionFilter, PayloadTooLargeException } from '@nestjs/common';
import type { Response } from 'express';
import { getMaxUploadMb } from '../../config/upload.config';

@Catch(PayloadTooLargeException)
export class UploadProblemDetailsFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const maxUploadMb = getMaxUploadMb();

    response
      .status(413)
      .type('application/problem+json')
      .send({
        type: 'https://sid3.dev/problems/upload-too-large',
        title: 'Arquivo excede o limite permitido',
        status: 413,
        detail: `O arquivo excede o limite máximo configurado de ${maxUploadMb} MB.`
      });
  }
}
