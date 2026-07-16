import * as path from 'node:path';
import * as fs from 'node:fs';
import Mocha from 'mocha';

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 60_000,
  });

  const testsRoot = path.resolve(__dirname);
  const files: string[] = [];

  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
      } else if (name.endsWith('.test.js')) {
        files.push(full);
      }
    }
  };
  walk(testsRoot);

  if (files.length === 0) {
    return Promise.reject(
      new Error(`No integration test files (*.test.js) under ${testsRoot}`)
    );
  }

  for (const f of files.sort()) {
    mocha.addFile(f);
  }

  return new Promise<void>((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} integration test(s) failed`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}
