import { createInterface } from 'readline';

export async function prompt(question: string, hidden = false): Promise<string> {
  if (hidden && process.stdin.isTTY) {
    const { Writable } = await import('stream');
    const rl = createInterface({
      input: process.stdin,
      output: new Writable({
        write: (_chunk, _encoding, callback) => callback(),
      }),
      terminal: true,
    });

    process.stdout.write(question);

    return new Promise((resolve) => {
      let value = '';

      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const onData = (char: string) => {
        switch (char) {
          case '\n':
          case '\r':
          case '\u0004':
            process.stdin.setRawMode?.(false);
            process.stdin.removeListener('data', onData);
            process.stdin.pause();
            process.stdout.write('\n');
            rl.close();
            resolve(value);
            break;
          case '\u0003':
            process.stdout.write('\n');
            process.exit(0);
            break;
          case '\u007F':
          case '\b':
            if (value.length > 0) {
              value = value.slice(0, -1);
              process.stdout.write('\b \b');
            }
            break;
          default:
            if (char.charCodeAt(0) >= 32) {
              value += char;
              process.stdout.write('*');
            }
            break;
        }
      };

      process.stdin.on('data', onData);
    });
  } else {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }
}

export async function confirm(message: string): Promise<boolean> {
  const answer = await prompt(`${message} (y/N): `);
  return answer.toLowerCase() === 'y';
}

export async function unlockVault(vault: import('../vault/vault.js').Vault): Promise<void> {
  const password = await prompt('Vault password: ', true);
  if (!password) {
    console.error('❌ Password required');
    process.exit(1);
  }
  try {
    await vault.unlock(password);
  } catch (error) {
    console.error('❌ Failed to unlock vault:', (error as Error).message);
    process.exit(1);
  }
}

export function requireVault(vault: import('../vault/vault.js').Vault): void {
  if (!vault.exists()) {
    console.error('❌ No vault found. Run "openmm-init" first.');
    process.exit(1);
  }
}
