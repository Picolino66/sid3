import { parseByteRange, publicPreviewKind } from './public-media';

describe('public media rules', () => {
  it('previews only images (except SVG), videos and audio', () => {
    expect(publicPreviewKind('image/jpeg', false)).toBe('image');
    expect(publicPreviewKind('video/mp4', false)).toBe('video');
    expect(publicPreviewKind('audio/mpeg', false)).toBe('audio');
    expect(publicPreviewKind('image/svg+xml', false)).toBeNull();
    expect(publicPreviewKind('text/html', false)).toBeNull();
    expect(publicPreviewKind('application/pdf', false)).toBeNull();
    expect(publicPreviewKind('video/mp4', true)).toBeNull();
  });

  it('parses single byte ranges and rejects ranges past the end of the file', () => {
    expect(parseByteRange(undefined, 100)).toEqual({ kind: 'full' });
    expect(parseByteRange('bytes=0-', 100)).toEqual({ kind: 'range', header: 'bytes=0-', start: 0 });
    expect(parseByteRange('bytes=10-19', 100)).toEqual({ kind: 'range', header: 'bytes=10-19', start: 10 });
    expect(parseByteRange('bytes=-30', 100)).toEqual({ kind: 'range', header: 'bytes=-30', start: 70 });
    expect(parseByteRange('bytes=100-', 100)).toEqual({ kind: 'unsatisfiable' });
    expect(parseByteRange('bytes=-0', 100)).toEqual({ kind: 'unsatisfiable' });
    // Formatos não suportados viram resposta completa.
    expect(parseByteRange('bytes=0-1,5-9', 100)).toEqual({ kind: 'full' });
    expect(parseByteRange('items=0-1', 100)).toEqual({ kind: 'full' });
    expect(parseByteRange('bytes=20-10', 100)).toEqual({ kind: 'full' });
  });
});
