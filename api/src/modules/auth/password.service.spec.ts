import { PasswordService } from './password.service';

describe(PasswordService.name, () => {
  it('hashes and verifies passwords', async () => {
    const service = new PasswordService();

    const passwordHash = await service.hashPassword('correct-horse-battery');

    expect(passwordHash).not.toBe('correct-horse-battery');
    await expect(service.verifyPassword('correct-horse-battery', passwordHash)).resolves.toBe(true);
    await expect(service.verifyPassword('wrong-password', passwordHash)).resolves.toBe(false);
  });
});
