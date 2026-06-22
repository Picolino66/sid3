import { ArgumentsHost, PayloadTooLargeException } from '@nestjs/common';
import { UploadProblemDetailsFilter } from './upload-problem-details.filter';

describe(UploadProblemDetailsFilter.name, () => {
  it('returns a structured 413 response', () => {
    const send = jest.fn();
    const type = jest.fn().mockReturnValue({ send });
    const status = jest.fn().mockReturnValue({ type });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) })
    } as unknown as ArgumentsHost;

    new UploadProblemDetailsFilter().catch(new PayloadTooLargeException('File too large'), host);

    expect(status).toHaveBeenCalledWith(413);
    expect(type).toHaveBeenCalledWith('application/problem+json');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'https://sid3.dev/problems/upload-too-large',
      status: 413,
      detail: expect.stringContaining('1024 MB')
    }));
  });
});
