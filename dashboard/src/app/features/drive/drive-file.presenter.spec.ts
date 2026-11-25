import '@angular/compiler';
import { describe, test } from 'node:test';
import assert from 'node:assert';
import { HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { downloadFileName, drivePreviewKind, driveTypeLabel, formatBytes, toBlobApiErrorMessage } from './drive-file.presenter.js';
import { DriveFile } from './drive.models.js';

function file(overrides: Partial<DriveFile> = {}): DriveFile {
  return {
    id: 'f1',
    parentId: 'root',
    driveId: null,
    isSharedDrive: false,
    name: 'foto.png',
    mimeType: 'image/png',
    isFolder: false,
    sizeBytes: 1024,
    md5Checksum: null,
    modifiedTime: null,
    webViewLink: null,
    downloadable: true,
    exportExtension: null,
    indexedAt: '2026-11-24T00:00:00.000Z',
    ...overrides
  };
}

describe('drive-file.presenter', () => {
  test('labels Google and regular mime types', () => {
    assert.strictEqual(driveTypeLabel(file({ mimeType: 'application/vnd.google-apps.folder' })), 'Pasta');
    assert.strictEqual(driveTypeLabel(file({ mimeType: 'image/jpeg' })), 'Imagem (jpeg)');
    assert.strictEqual(driveTypeLabel(file({ mimeType: 'application/zip' })), 'zip');
  });

  test('previews only small binary files of supported types', () => {
    assert.strictEqual(drivePreviewKind(file()), 'image');
    assert.strictEqual(drivePreviewKind(file({ mimeType: 'application/pdf' })), 'pdf');
    assert.strictEqual(drivePreviewKind(file({ mimeType: 'application/json' })), 'text');
    assert.strictEqual(drivePreviewKind(file({ sizeBytes: 100 * 1024 * 1024 })), null);
    assert.strictEqual(
      drivePreviewKind(file({ mimeType: 'application/vnd.google-apps.document', exportExtension: 'docx', sizeBytes: null })),
      null
    );
    assert.strictEqual(drivePreviewKind(file({ isFolder: true })), null);
  });

  test('formats sizes', () => {
    assert.strictEqual(formatBytes(null), '—');
    assert.strictEqual(formatBytes(512), '512 B');
    assert.strictEqual(formatBytes(1536), '1.5 KB');
    assert.strictEqual(formatBytes(5 * 1024 ** 3), '5.00 GB');
  });

  test('uses the Content-Disposition name, falling back to the export extension', () => {
    const withHeader = new HttpResponse<Blob>({
      headers: new HttpHeaders({ 'Content-Disposition': `attachment; filename="Relat_rio.docx"; filename*=UTF-8''Relat%C3%B3rio.docx` })
    });
    assert.strictEqual(downloadFileName(withHeader, file()), 'Relatório.docx');

    const withoutHeader = new HttpResponse<Blob>({});
    assert.strictEqual(downloadFileName(withoutHeader, file({ name: 'Planilha', exportExtension: 'xlsx' })), 'Planilha.xlsx');
  });

  test('reads the API error message from a Blob body', async () => {
    const error = new HttpErrorResponse({
      status: 422,
      error: new Blob([JSON.stringify({ message: 'Pastas não podem ser baixadas' })], { type: 'application/json' })
    });
    assert.strictEqual(await toBlobApiErrorMessage(error), 'Pastas não podem ser baixadas');
  });
});
