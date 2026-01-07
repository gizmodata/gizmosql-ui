import { exec } from 'child_process';

/**
 * Simple, pkg-compatible browser opener.
 * Uses native system commands instead of the 'open' package.
 */
export function openBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let command: string;

    switch (process.platform) {
      case 'darwin':
        command = `open "${url}"`;
        break;
      case 'win32':
        command = `start "" "${url}"`;
        break;
      default:
        // Linux and others
        command = `xdg-open "${url}"`;
        break;
    }

    exec(command, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
