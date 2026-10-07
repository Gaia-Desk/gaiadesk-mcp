import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  binaryNames,
  candidates,
  locate,
  npmCliBinary,
  pathDirs,
  standardLocations,
  CliNotFoundError,
  DOWNLOAD_URL,
} from '../dist/locate.js';

const only = (...paths: string[]) => (f: string) => paths.includes(f);

test('macOS: PATH first, then the app bundle', () => {
  const env = { PATH: '/opt/bin:/usr/bin' };
  const c = candidates('darwin', env, '/Users/me');
  assert.deepEqual(c.slice(0, 2), ['/opt/bin/gaiadesk-cli', '/usr/bin/gaiadesk-cli']);
  assert.ok(c.includes('/Applications/GaiaDesk.app/Contents/MacOS/gaiadesk-cli'));
  assert.ok(c.includes('/Users/me/Applications/GaiaDesk.app/Contents/MacOS/gaiadesk-cli'));
  assert.ok(c.includes('/usr/local/bin/gaiadesk-cli'));
});

test('macOS: falls back to the app bundle when nothing is on PATH', () => {
  const app = '/Applications/GaiaDesk.app/Contents/MacOS/gaiadesk-cli';
  assert.equal(locate({ platform: 'darwin', env: { PATH: '/usr/bin' }, home: '/Users/me', isRunnable: only(app) }), app);
});

test('PATH wins over the standard locations', () => {
  const onPath = '/home/me/bin/gaiadesk-cli';
  const got = locate({
    platform: 'linux',
    env: { PATH: '/home/me/bin' },
    home: '/home/me',
    isRunnable: only(onPath, '/usr/bin/gaiadesk-cli'),
  });
  assert.equal(got, onPath);
});

test('Linux: /usr/bin from the .deb/.rpm', () => {
  assert.deepEqual(standardLocations('linux', {}, '/home/me').slice(0, 2), ['/usr/bin/gaiadesk-cli', '/usr/local/bin/gaiadesk-cli']);
  assert.equal(locate({ platform: 'linux', env: {}, home: '/home/me', isRunnable: only('/usr/bin/gaiadesk-cli') }), '/usr/bin/gaiadesk-cli');
});

test('Windows: PATHEXT names, .exe first', () => {
  assert.deepEqual(binaryNames('win32', { PATHEXT: '.COM;.EXE;.BAT' }), ['gaiadesk-cli.exe', 'gaiadesk-cli.com', 'gaiadesk-cli.bat']);
  assert.deepEqual(binaryNames('linux', { PATHEXT: '.EXE' }), ['gaiadesk-cli']);
});

test('Windows: Path with quotes and semicolons, then Program Files and LOCALAPPDATA', () => {
  const env = {
    Path: 'C:\\Windows;"C:\\Tools Dir";',
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
  };
  assert.deepEqual(pathDirs('win32', env), ['C:\\Windows', 'C:\\Tools Dir']);
  const c = candidates('win32', env, 'C:\\Users\\me');
  assert.equal(c[0], 'C:\\Windows\\gaiadesk-cli.exe');
  assert.ok(c.includes('C:\\Tools Dir\\gaiadesk-cli.exe'));
  assert.ok(c.includes('C:\\Program Files\\GaiaDesk\\gaiadesk-cli.exe'));
  assert.ok(c.includes('C:\\Program Files (x86)\\GaiaDesk\\gaiadesk-cli.exe'));
  assert.ok(c.includes('C:\\Users\\me\\AppData\\Local\\GaiaDesk\\gaiadesk-cli.exe'));
  const pf = 'C:\\Program Files\\GaiaDesk\\gaiadesk-cli.exe';
  assert.equal(locate({ platform: 'win32', env, home: 'C:\\Users\\me', isRunnable: only(pf) }), pf);
});

test('Windows: a default Program Files guess when the environment names none', () => {
  assert.deepEqual(standardLocations('win32', {}, ''), ['C:\\Program Files\\GaiaDesk\\gaiadesk-cli.exe']);
});

test('$GAIADESK_CLI wins, and a bad one is an error, never a silent fallback', () => {
  const env = { GAIADESK_CLI: '/custom/gaiadesk-cli', PATH: '/usr/bin' };
  assert.equal(locate({ platform: 'linux', env, home: '/h', isRunnable: only('/custom/gaiadesk-cli', '/usr/bin/gaiadesk-cli') }), '/custom/gaiadesk-cli');
  assert.throws(
    () => locate({ platform: 'linux', env, home: '/h', isRunnable: only('/usr/bin/gaiadesk-cli') }),
    (e: unknown) => e instanceof CliNotFoundError && /GAIADESK_CLI/.test(e.message) && e.message.includes(DOWNLOAD_URL),
  );
});

test('not found: the error names the download page and what was tried', () => {
  assert.throws(
    () => locate({ platform: 'darwin', env: { PATH: '/usr/bin' }, home: '/Users/me', isRunnable: () => false }),
    (e: unknown) => {
      assert.ok(e instanceof CliNotFoundError);
      assert.ok(e.message.includes('https://gaiadesk.net/download'));
      assert.ok(e.message.includes('/Applications/GaiaDesk.app/Contents/MacOS/gaiadesk-cli'));
      assert.ok(e.tried.includes('/usr/bin/gaiadesk-cli'));
      return true;
    },
  );
});

test('@gaiadesk/cli\'s binary comes after $GAIADESK_CLI and before PATH', () => {
  const npm = '/x/node_modules/@gaiadesk/cli-linux-x64-gnu/bin/gaiadesk-cli';
  const env = { PATH: '/usr/bin' };
  // Before PATH.
  assert.equal(locate({ platform: 'linux', env, home: '/h', isRunnable: only(npm, '/usr/bin/gaiadesk-cli'), npmCli: () => npm }), npm);
  // After an explicit $GAIADESK_CLI.
  assert.equal(
    locate({ platform: 'linux', env: { ...env, GAIADESK_CLI: '/c/gaiadesk-cli' }, home: '/h', isRunnable: only(npm, '/c/gaiadesk-cli'), npmCli: () => npm }),
    '/c/gaiadesk-cli',
  );
  // Not runnable, or none: the search goes on.
  assert.equal(locate({ platform: 'linux', env, home: '/h', isRunnable: only('/usr/bin/gaiadesk-cli'), npmCli: () => npm }), '/usr/bin/gaiadesk-cli');
  assert.equal(locate({ platform: 'linux', env, home: '/h', isRunnable: only('/usr/bin/gaiadesk-cli'), npmCli: () => null }), '/usr/bin/gaiadesk-cli');
});

test('npmCliBinary: the package\'s tryBinaryPath, null for anything wrong', () => {
  assert.equal(npmCliBinary(() => ({ tryBinaryPath: () => '/n/bin/gaiadesk-cli' })), '/n/bin/gaiadesk-cli');
  assert.equal(npmCliBinary(() => ({ tryBinaryPath: () => null })), null);
  assert.equal(npmCliBinary(() => ({})), null);
  assert.equal(
    npmCliBinary(() => {
      throw new Error('Cannot find module');
    }),
    null,
  );
});

test('not found: the message offers the npm package', () => {
  assert.throws(
    () => locate({ platform: 'linux', env: {}, home: '/h', isRunnable: () => false, npmCli: () => null }),
    (e: unknown) => e instanceof CliNotFoundError && e.message.includes('npm install -g @gaiadesk/cli'),
  );
});

test('candidates are de-duplicated', () => {
  const c = candidates('linux', { PATH: '/usr/bin:/usr/bin' }, '');
  assert.equal(c.filter((x) => x === '/usr/bin/gaiadesk-cli').length, 1);
});
